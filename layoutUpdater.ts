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

	const menuFolders = readdirSync('./').filter(
		(lF) =>
			!lF.startsWith('@') &&
			!lF.startsWith('.') &&
			!lF.startsWith('node_modules') &&
			statSync(lF).isDirectory()
	)

	const layoutFolders = []
	menuFolders.forEach((m) =>
		readdirSync(m).forEach((lF) => layoutFolders.push(`${m}/${lF}`))
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
			last_updated: new Date(),
		}

		file.save()

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
					(dL) =>
						l.uuid === dL.uuid &&
						dL.details.version !== l.details.version
				)
			)
			.map((dL) => layouts.find((l) => l.uuid === dL.uuid))

	let nL,
		dL = [],
		oL = []

	if (newLayouts.length > 0) {
		console.log('\n---- newLayouts:')
		console.log(newLayouts.map((l) => l.name).join('\n'))

		const cs = new pgp.helpers.ColumnSet(
			['uuid', 'name', 'details', 'baselayout', 'menu', 'last_updated'],
			{
				table: 'layouts',
			}
		)

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
		console.log('\n---- outdatedLayouts:')
		oL = outdatedLayouts.map((l) => {
			console.log(`${l.name}\n`)
			return db.one(
				`
				UPDATE layouts
				SET name = $2,
					details = $3,
					baselayout = $4,
					menu = $5,
					last_updated = $6
				WHERE uuid = $1
				RETURNING *
			`,
				[
					l.uuid,
					l.name,
					l.details,
					l.baselayout,
					l.menu,
					l.last_updated,
				]
			)
		})
	}

	Promise.all([nL, ...dL, ...oL]).then(() => db.$pool.end())
}

run()
