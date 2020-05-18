import 'source-map-support/register'
const editJsonFile = require('edit-json-file')
const mkdirp = require('mkdirp')
const link = require('fs-symlink')
import { readdirSync, statSync, existsSync } from 'fs'

async function run() {
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

	console.log(layoutFolders)

	layoutFolders.forEach((lF) => {
		let file = editJsonFile(`${lF}/details.json`)
		const details = file.toObject()

		if (existsSync(`./${lF}/overlay.png`))
			link(
				`./${lF}/overlay.png`,
				`../storage/layouts/${details.uuid}/overlay.png`
			)
	})
}

run()
