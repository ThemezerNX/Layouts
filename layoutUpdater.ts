require('dotenv').config()
import 'source-map-support/register'
const editJsonFile = require('edit-json-file')
import { uuid } from 'uuidv4'
const pgPromise = require('pg-promise')
import { readdirSync, statSync, readFileSync } from 'fs'

const config = {
	host: process.env.POSTGRES_HOST,
	port: process.env.POSTGRES_PORT,
	database: process.env.POSTGRES_DB,
	user: process.env.POSTGRES_USER,
	password: process.env.POSTGRES_PASSWORD,
}

export const pgp = pgPromise({ capSQL: true })
export const db = pgp(config)

async function run() {
	const dbLayouts = await db.any(`
		SELECT *
		FROM layouts
	`)

	const layoutFolders = readdirSync('./').filter(
		(lF) =>
			!lF.startsWith('@') &&
			!lF.startsWith('.') &&
			!lF.startsWith('node_modules') &&
			statSync(lF).isDirectory()
	)

	const layouts = layoutFolders.map((lF) => {
		let file = editJsonFile(`${lF}/details.json`)
		if (!file.get('uuid')) file.set('uuid', uuid())

		const details = file.toObject(),
			baselayout = readFileSync(`${lF}/layout.json`, 'utf-8')

		let resJson: any = {
			name: details.name,
			uuid: details.uuid,
			details,
			baselayout,
			menu: JSON.parse(baselayout).TargetName.replace(/.szs/i, ''),
		}

		file.save()

		return resJson
	})

	const newLayouts = layouts.filter(
			(p) => !dbLayouts.some((dP) => dP.uuid === p.uuid)
		),
		deletedLayouts = dbLayouts.filter(
			(dP) => !layouts.some((p) => p.uuid === dP.uuid)
		),
		outdatedLayouts = dbLayouts
			.filter((p) =>
				layouts.find(
					(dp) =>
						p.uuid === dp.uuid &&
						dp.details.version !== p.details.version
				)
			)
			.map((dP) => layouts.find((p) => p.uuid === dP.uuid))

	let nP,
		dP = [],
		oP = []

	if (newLayouts.length > 0) {
		const cs = new pgp.helpers.ColumnSet(
			['uuid', 'name', 'details', 'baselayout', 'menu'],
			{
				table: 'layouts',
			}
		)

		const query = () => pgp.helpers.insert(newLayouts, cs)
		nP = db.none(query)
	}

	if (deletedLayouts.length > 0)
		dP = deletedLayouts.map((p) =>
			db.none(
				`
				DELETE FROM layouts
				WHERE uuid = $1
			`,
				[p.details.uuid]
			)
		)

	if (outdatedLayouts.length > 0)
		oP = outdatedLayouts.map((p) =>
			db.none(
				`
				UPDATE layouts
				SET baselayout = $2
				WHERE uuid = $1
			`,
				[p.details.uuid, p]
			)
		)

	Promise.all([nP, ...dP, ...oP]).then(() => db.$pool.end())
}

run()
