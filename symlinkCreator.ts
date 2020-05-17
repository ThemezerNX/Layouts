import 'source-map-support/register'
const editJsonFile = require('edit-json-file')
const link = require('fs-symlink')
import { readdirSync, statSync, symlink } from 'fs'

async function run() {
	const layoutFolders = readdirSync('./').filter(
		(lF) =>
			!lF.startsWith('@') &&
			!lF.startsWith('.') &&
			!lF.startsWith('node_modules') &&
			statSync(lF).isDirectory()
	)

	const layouts = layoutFolders.map((lF) => {
		let file = editJsonFile(`${lF}/details.json`)

		const details = file.toObject()

		link(`./${lF}/overlay.png`, `../storage/overlays/${details.uuid}.png`)
	})
}

run()
