require('dotenv').config()
import 'source-map-support/register'
const editJsonFile = require('edit-json-file')
import { uuid } from 'uuidv4'
const pgPromise = require('pg-promise')
import { accessSync, constants, readdirSync, statSync, readFileSync } from 'fs'

const config = {
	host: process.env.POSTGRES_HOST,
	port: process.env.POSTGRES_PORT,
	database: process.env.POSTGRES_DB,
	user: process.env.POSTGRES_USER,
	password: process.env.POSTGRES_PASSWORD,
}

export const pgp = pgPromise({ capSQL: true })
export const db = pgp(config)

const exist = (dir) => {
	try {
		accessSync(dir, constants.F_OK | constants.R_OK | constants.W_OK)
		return true
	} catch (e) {
		return false
	}
}

async function run() {
	const dbLayouts = await db.any(`
		SELECT *
		FROM layouts
	`)

	const menuFolders = readdirSync('./').filter(
		(lF) =>
			!lF.startsWith('@') &&
			!lF.startsWith('.') &&
			!lF.startsWith('node_modules') &&
			statSync(lF).isDirectory()
	)

	const layoutFolders = []
	menuFolders.forEach((m) => {
		readdirSync(m).forEach((lF) => {
			layoutFolders.push(`${m}/${lF}`)
		})
	})

	const layouts = layoutFolders.map((lF) => {
		const f = editJsonFile(`${lF}/details.json`)
		if (!f.get('uuid')) {
			f.set('uuid', uuid())
			f.save()
		}

		const details = f.toObject(),
			baselayout = readFileSync(`${lF}/layout.json`, 'utf-8')

		const pcs = []
		if (exist(`${lF}/pieces`)) {
			const opts = readdirSync(`${lF}/pieces`)
			opts.forEach((op) => {
				const split = op.split('_')
				if (split.length > 1) split.shift()
				const optionName = split.join()

				const values = readdirSync(`${lF}/pieces/${op}`)
				const jsons = values.filter((v) => v.endsWith('.json'))

				const valueJsons = []
				jsons.forEach((j) => {
					const trimmed = j.replace('.json', '')

					valueJsons.push({
						value: trimmed,
						image: values.includes(`${trimmed}.jpg`),
						json: readFileSync(
							`${lF}/pieces/${op}/${trimmed}.json`,
							'utf-8'
						),
					})
				})

				pcs.push({
					name: optionName,
					values: valueJsons,
				})
			})
		}

		let resJson: any = {
			name: details.name,
			uuid: details.uuid,
			details,
			baselayout,
			menu: JSON.parse(baselayout).TargetName.replace(/.szs/i, ''),
			last_updated: new Date(),
			pieces: pcs,
		}

		return resJson
	})

	const newLayouts = layouts.filter(
			(l) => !dbLayouts.some((dL) => dL.uuid === l.uuid)
		),
		deletedLayouts = dbLayouts.filter(
			(dL) => !layouts.some((l) => l.uuid === dL.uuid)
		),
		outdatedLayouts = dbLayouts
			.filter((l) =>
				layouts.find(
					(dL) => l.uuid === dL.uuid
					// && dL.details.version !== l.details.version
				)
			)
			.map((dL) => layouts.find((l) => l.uuid === dL.uuid))

	let nL,
		dL = [],
		oL

	const cs = new pgp.helpers.ColumnSet(
		[
			{ name: 'uuid', cast: 'uuid' },
			'name',
			{ name: 'details', cast: 'json' },
			'baselayout',
			'menu',
			{ name: 'last_updated', cast: 'timestamp without time zone' },
			{ name: 'pieces', cast: 'json[]' },
		],
		{
			table: 'layouts',
		}
	)

	if (newLayouts.length > 0) {
		console.log('\n---- newLayouts:')
		console.log(newLayouts.map((l) => l.name).join('\n'))

		const query = () => pgp.helpers.insert(newLayouts, cs)
		nL = db.none(query)
	}

	if (deletedLayouts.length > 0) {
		console.log('\n---- deletedLayouts:')
		dL = deletedLayouts.map((l) => {
			console.log(`${l.name}\n`)

			return db.none(
				`
					DELETE FROM layouts
					WHERE uuid = $1
				`,
				[l.uuid]
			)
		})
	}

	if (outdatedLayouts.length > 0) {
		console.log('\n---- existingLayouts:')
		console.log(outdatedLayouts.map((l) => l.name).join('\n'))

		const query = () =>
			pgp.helpers.update(outdatedLayouts, cs) + ' where v.uuid = t.uuid'
		oL = db.none(query)
	}

	Promise.all([nL, ...dL, oL]).then(() => db.$pool.end())
}

run()
