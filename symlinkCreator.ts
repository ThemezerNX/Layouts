import 'source-map-support/register'
const editJsonFile = require('edit-json-file')
const link = require('fs-symlink')
import {
	accessSync,
	constants,
	readFileSync,
	readdirSync,
	statSync,
	existsSync,
} from 'fs'

const exist = (dir) => {
	try {
		accessSync(dir, constants.F_OK | constants.R_OK | constants.W_OK)
		return true
	} catch (e) {
		return false
	}
}

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

		if (exist(`${lF}/pieces`)) {
			const opts = readdirSync(`${lF}/pieces`)
			opts.forEach((op) => {
				const split = op.split('_')
				if (split.length > 1) split.shift()
				const optionName = split.join()

				const values = readdirSync(`${lF}/pieces/${op}`)
				const images = values.filter((v) => v.endsWith('.jpg'))

				images.forEach((j) => {
					link(
						`./${lF}/pieces/${op}/${j}`,
						`../storage/layouts/${details.uuid}/pieces/${optionName}/${j}`
					)
				})
			})
		}
	})
}

run()
