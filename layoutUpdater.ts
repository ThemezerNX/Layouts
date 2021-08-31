import 'source-map-support/register'
const editJsonFile = require('edit-json-file')
import { uuid } from 'uuidv4'
import { accessSync, constants, readdirSync, statSync, readFileSync } from 'fs'
import { pgp, db } from './db'

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

	const targetFolders = readdirSync('./').filter(
		(lF) =>
			!lF.startsWith('@') && !lF.startsWith('.') && !lF.startsWith('node_modules') && statSync(lF).isDirectory()
	)

	const layoutFolders = []
	targetFolders.forEach((m) => {
		readdirSync(m).forEach((lF) => {
			layoutFolders.push(`${m}/${lF}`)
		})
	})

	const layouts = layoutFolders.map((lF) => {
		const detailsFile = editJsonFile(`${lF}/details.json`, { autosave: true })

		if (!detailsFile.get('uuid')) {
			detailsFile.set('uuid', uuid())
		}

		const details = detailsFile.toObject()
		const jsonFile = editJsonFile(`${lF}/layout.json`, { autosave: true })

		jsonFile.unset('PatchName')
		jsonFile.unset('AuthorName')
		jsonFile.unset('TargetName')
		if (details.creator_id !== '0') {
			jsonFile.unset('Ready8X')
		}

		let commonlayout = null
		try {
			commonlayout = readFileSync(`${lF}/common.json`, 'utf-8')
		} catch (e) {}

		const pieces = []
		if (exist(`${lF}/pieces`)) {
			const options = readdirSync(`${lF}/pieces`)
			options.forEach((option) => {
				const split = option.split('_')
				if (split.length > 1) split.shift()
				const optionName = split.join()

				const values = readdirSync(`${lF}/pieces/${option}`)
				const jsons = values.filter((v) => v.endsWith('.json'))

				const valueJsons = []
				jsons.forEach((j) => {
					const valueName = j.replace('.json', '')

					const valueFile = editJsonFile(`${lF}/pieces/${option}/${valueName}.json`)
					if (!valueFile.get('uuid')) {
						valueFile.set('uuid', uuid())
					}

					const value = valueFile.toObject()
					const value_uuid = value.uuid
					delete value.uuid

					valueJsons.push({
						value: jsons.length > 1 ? valueName : true,
						uuid: value_uuid,
						image: values.includes(`${valueName}.png`) ? `${valueName}.png` : null,
						json: JSON.stringify(value),
					})
				})

				pieces.push({
					name: optionName,
					values: valueJsons,
				})
			})
		}

		const layout_str = JSON.stringify(jsonFile.toObject())

		let resJson: any = {
			uuid: details.uuid,
			details,
			baselayout: layout_str !== '{}' ? layout_str : null,
			target: jsonFile.get('TargetName')?.replace(/.szs/i, '') || lF.split('/')[0],
			last_updated: new Date(),
			pieces,
			commonlayout,
			creator_id: details.creator_id,
		}

		return resJson
	})

	const newLayouts = layouts.filter((l) => !dbLayouts.some((dL) => dL.uuid === l.uuid)),
		deletedLayouts = dbLayouts.filter((dL) => !layouts.some((l) => l.uuid === dL.uuid)),
		existingLayouts = dbLayouts
			.filter((l) =>
				layouts.find(
					(dL) =>
						l.uuid === dL.uuid &&
						// Check if any of the fields changed
						(JSON.stringify(dL.details) !== JSON.stringify(l.details) ||
							dL.baselayout !== l.baselayout ||
							JSON.stringify(dL.pieces) !== JSON.stringify(l.pieces) ||
							dL.commonlayout !== l.commonlayout ||
							dL.creator_id !== l.creator_id)
				)
			)
			.map((dL) => layouts.find((l) => l.uuid === dL.uuid))

	let nL,
		dL = [],
		oL

	const cs = new pgp.helpers.ColumnSet(
		[
			{ name: 'uuid', cast: 'uuid' },
			{ name: 'details', cast: 'json' },
			'baselayout',
			'target',
			{ name: 'last_updated', cast: 'timestamp without time zone' },
			{ name: 'pieces', cast: 'json[]' },
			'commonlayout',
			'creator_id',
		],
		{
			table: 'layouts',
		}
	)

	if (newLayouts.length > 0) {
		console.log('\n---- newLayouts:')
		console.log(newLayouts.map((l) => l.details.name).join('\n'))

		const query = () => pgp.helpers.insert(newLayouts, cs)
		nL = db.none(query)
	}

	if (deletedLayouts.length > 0) {
		console.log('\n---- deletedLayouts:')
		dL = deletedLayouts.map((l) => {
			console.log(`${l.details.name}\n`)

			return db.none(
				`
					DELETE FROM layouts
					WHERE uuid = $1
				`,
				[l.uuid]
			)
		})
	}

	if (existingLayouts.length > 0) {
		console.log('\n---- existingLayouts:')
		console.log(existingLayouts.map((l) => l.details.name).join('\n'))

		const query = () => pgp.helpers.update(existingLayouts, cs) + ' where v.uuid = t.uuid'
		oL = db.none(query)
	}

	Promise.all([nL, ...dL, oL]).then(() => db.$pool.end())
}

run()
