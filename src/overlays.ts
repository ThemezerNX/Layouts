// Renders `overlay-dark.png` and `overlay-light.png` for layouts through the Themezer API's `renderLayoutOverlay` query, which runs the same
// renderer as the site (the firmware layouts it needs cannot live in this public repository).
//
// Usage: bun src/overlays.ts [git ref]
//   With a ref, renders the layouts whose files changed since it; without one, every layout. Either way it also renders every layout that
//   lacks one of its overlays. THEMEZER_GRAPHQL_ENDPOINT overrides the API (default https://themezer.net/graphql).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const ENDPOINT = process.env.THEMEZER_GRAPHQL_ENDPOINT ?? 'https://themezer.net/graphql'
const ROOT = path.resolve(__dirname, '..')
const TARGETS = path.join(ROOT, 'targets')
const OVERLAYS = ['overlay-dark.png', 'overlay-light.png']

const since = process.argv[2]

type GraphqlBody = { data?: any; errors?: { message: string }[] }

/** Posts a request, waiting out the API's rate limit (60 renders a minute) and the odd non-JSON error page. */
const post = async (body: string | FormData): Promise<any> => {
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(ENDPOINT, {
			method: 'POST',
			// Apollo refuses multipart requests without this header (CSRF protection).
			headers:
				typeof body === 'string'
					? { 'content-type': 'application/json' }
					: { 'apollo-require-preflight': 'true' },
			body,
		})
		const json = response.headers.get('content-type')?.includes('json')
		const parsed: GraphqlBody | undefined = json ? await response.json() : undefined
		const throttled =
			response.status === 429 || parsed?.errors?.some((e) => /too many requests|throttl/i.test(e.message))
		if (parsed && !throttled) {
			if (parsed.errors) throw new Error(JSON.stringify(parsed.errors).slice(0, 500))
			return parsed.data
		}
		if (attempt >= 6) throw new Error(`${ENDPOINT} answered ${response.status} after ${attempt + 1} attempts`)
		await sleep(throttled ? 61_000 : 2_000 * (attempt + 1))
	}
}

const query = (document: string, variables: Record<string, unknown>) =>
	post(JSON.stringify({ query: document, variables }))

const readText = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined)

const isDir = (...parts: string[]) => statSync(path.join(...parts)).isDirectory()
const layoutDirs = readdirSync(TARGETS)
	.filter((target) => isDir(TARGETS, target))
	.flatMap((target) =>
		readdirSync(path.join(TARGETS, target))
			.filter((name) => name !== '_GLOBAL' && isDir(TARGETS, target, name))
			.map((name) => path.join('targets', target, name)),
	)

// A layout's overlay shows its layout.json and common.json; its options and the overlays themselves do not change it.
const changed = since
	? new Set(
			execFileSync('git', ['diff', '--name-only', '--no-renames', since, '--', 'targets'], {
				cwd: ROOT,
				encoding: 'utf8',
			})
				.split('\n')
				.filter((file) => /^targets\/[^/]+\/[^/]+\/(layout|common|details)\.json$/.test(file))
				.map((file) => path.dirname(file)),
		)
	: undefined

const todo = layoutDirs.filter(
	(dir) => !changed || changed.has(dir) || OVERLAYS.some((overlay) => !existsSync(path.join(ROOT, dir, overlay))),
)
if (!todo.length) {
	console.log('No layout needs new overlays.')
	process.exit(0)
}

// The installer applies its firmware fixes by layout ID, so a layout renders with the ID the site gives it; a new layout gets a plain Themezer ID.
const ids = new Map<string, Map<string, string>>()
const idOf = async (target: string, uuid: string | undefined) => {
	if (!ids.has(target)) {
		const data = await query(
			'query($target: Target!) { switch { layouts(target: $target, paginationArgs: { limit: 1000 }) { nodes { uuid hexId } } } }',
			{ target },
		)
		ids.set(
			target,
			new Map(data.switch.layouts.nodes.map((node: { uuid: string; hexId: string }) => [node.uuid, node.hexId])),
		)
	}
	const hexId = uuid && ids.get(target)!.get(uuid)
	if (!hexId) return 'Themezer:new'
	const data = await query('query($hexId: Hexadecimal!) { switch { buildLayout(hexId: $hexId) { data } } }', {
		hexId,
	})
	return JSON.parse(Buffer.from(data.switch.buildLayout.data, 'base64').toString()).ID as string
}

const RENDER = `query($target: Target!, $layout: Upload!, $commonLayout: Upload, $light: Boolean) {
	switch { renderLayoutOverlay(target: $target, layout: $layout, commonLayout: $commonLayout, light: $light) { data } }
}`

const render = async (target: string, layout: string, common: string | undefined, light: boolean) => {
	const form = new FormData()
	const variables = { target, layout: null, commonLayout: null, light }
	form.append('operations', JSON.stringify({ query: RENDER, variables }))
	form.append(
		'map',
		JSON.stringify(
			common ? { 0: ['variables.layout'], 1: ['variables.commonLayout'] } : { 0: ['variables.layout'] },
		),
	)
	form.append('0', new Blob([layout], { type: 'application/json' }), 'layout.json')
	if (common) form.append('1', new Blob([common], { type: 'application/json' }), 'common.json')
	const data = await post(form)
	return Buffer.from(data.switch.renderLayoutOverlay.data, 'base64')
}

for (const dir of todo) {
	const [, target, name] = dir.split(path.sep)
	const details = JSON.parse(readText(path.join(ROOT, dir, 'details.json')) ?? '{}')
	const id = await idOf(target, details.uuid)
	const layout = JSON.stringify({
		PatchName: name,
		ID: id,
		...JSON.parse(readText(path.join(ROOT, dir, 'layout.json')) ?? '{}'),
	})
	const common = readText(path.join(ROOT, dir, 'common.json'))
	for (const overlay of OVERLAYS) {
		writeFileSync(
			path.join(ROOT, dir, overlay),
			await render(target, layout, common, overlay === 'overlay-light.png'),
		)
	}
	console.log(`${dir} (${id})`)
}
