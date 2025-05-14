import { readFileSync } from 'fs'
import * as path from 'node:path'
import { isTarget } from '@themezernx/target-parser/dist'
import * as editJsonFile from 'edit-json-file'
import { randomUUID } from 'node:crypto'
import * as directoryTree from 'directory-tree'

function customizeDirectoryTree(node: any): any {
	if (Array.isArray(node.children)) {
		const childrenObj: Record<string, any> = {}
		for (const child of node.children) {
			childrenObj[child.name] = customizeDirectoryTree(child)
		}
		node.children = childrenObj
	}
	// other stuff
	if (node.type === 'file') {
		node.nameOnly = trimExtension(node.name)
	}
	return node
}

function trimExtension(fileName: string): string {
	const ext = path.extname(fileName)
	return fileName.slice(0, -ext.length)
}

const TARGETS_FOLDER_PATH = path.resolve(__dirname, '..', 'targets')

;(async () => {
	// Start reading the 'targets' folders and map every target with a list of layout names
	const tree = customizeDirectoryTree(directoryTree(TARGETS_FOLDER_PATH, { attributes: ['extension', 'type'] }))

	if (Object.keys(tree.children).some((target) => !isTarget(target))) {
		throw new Error('Invalid target folder structure')
	}

	for (const target of Object.keys(tree.children)) {
		const targetTree = tree.children[target]
		for (const layoutName of Object.keys(targetTree.children)) {
			const layoutTree = tree.children[target].children[layoutName]

			// Check Options
			const optionsPath = layoutTree.children['options']?.path
			if (!!optionsPath) {
				for (const optionFolderName of Object.keys(layoutTree.children['options'].children)) {
					const optionTree = layoutTree.children['options'].children[optionFolderName]
					const [priority, optionType, optionName] = optionFolderName.split('_')
					if (!priority || !optionType || !optionName) {
						throw new Error(`Invalid option name ${optionFolderName}, ${optionsPath}`)
					}
					if (isNaN(Number(priority))) {
						throw new Error(`Invalid option priority ${priority}, ${optionsPath}`)
					}
					const [_, typeKey, _2, args] = optionType.match(/([A-Z]+)(\((.+?)\))?/)
					if (!['TOGGLE', 'INTEGER', 'DECIMAL', 'STRING', 'COLOR', 'SELECT'].includes(typeKey)) {
						throw new Error(`Invalid option type ${typeKey}, ${optionsPath}`)
					}
					if (!!args) {
						//!['INTEGER', 'DECIMAL', 'STRING'].includes(typeKey)
						if (typeKey === "INTEGER") {
							// minmax
							const [min, max] = args.split(',').map((arg) => parseInt(arg.trim()))
							if (isNaN(min) || isNaN(max)) {
								throw new Error(`Invalid option type ${typeKey} with args ${args}, ${optionsPath}`)
							} else if (min > max) {
								throw new Error(`Invalid values ${args} for ${typeKey}, ${optionsPath}`)
							}
						} else if (typeKey === "DECIMAL") {
							// minmax
							const [min, max] = args.split(',').map((arg) => Number(arg.trim()))
							if (isNaN(min) || isNaN(max)) {
								throw new Error(`Invalid option type ${typeKey} with args ${args}, ${optionsPath}`)
							} else if (min > max) {
								throw new Error(`Invalid values ${args} for ${typeKey}, ${optionsPath}`)
							}
						} else if (typeKey === "STRING") {
							// minmax length
							const [min, max] = args.split(',').map((arg) => parseInt(arg.trim()))
							if (isNaN(min) || isNaN(max)) {
								throw new Error(`Invalid option type ${typeKey} with args ${args}, ${optionsPath}`)
							} else if (min > max) {
								throw new Error(`Invalid values ${args} for ${typeKey}, ${optionsPath}`)
							}
						} else {
							throw new Error(`Type options not supported for ${typeKey}, ${optionsPath}`)
						}
					}

					const optionValues = Object.values(optionTree.children).filter((c) => c['extension'] === '.json')
					if (typeKey === 'SELECT') {
						if (optionValues.length < 2) {
							throw new Error(`Not enough select options values ${optionFolderName}, ${optionsPath}`)
						}
					} else {
						if (optionValues.length !== 1) {
							throw new Error(`Not exactly 1 select option ${optionFolderName}, ${optionsPath}`)
						}
					}
				}
			}

			if (layoutName === '_GLOBAL') {
				continue
			}

			// Read details
			if (!('details.json' in layoutTree.children)) {
				throw new Error(`details.json is required, but does not exist, ${layoutTree.name}`)
			}
			const detailsFilePath = layoutTree.children['details.json']?.path
			if (!detailsFilePath) {
				throw new Error('details.json file not found, ' + layoutTree.name)
			}
			const detailsFile = editJsonFile(detailsFilePath, {
				autosave: true,
				stringify_width: 4,
			})
			if (!detailsFile.get('creatorId')) {
				throw new Error('No creatorId found in details.json, ' + layoutTree.name)
			}
			if (!detailsFile.get('uuid')) {
				console.log('No UUID found in details.json, setting one', layoutTree.name)
				detailsFile.set('uuid', randomUUID())
			}
			// Remove '#' in color field if it is there
			if (detailsFile.get('color')?.startsWith('#')) {
				console.log('Removing # from color field', layoutTree.name)
				detailsFile.set('color', detailsFile.get('color').slice(1))
			}

			const layoutJsonPath = layoutTree.children['layout.json']?.path
			if (!!layoutJsonPath) {
				const layoutFile = editJsonFile(layoutJsonPath, { stringify_width: 4 })
				layoutFile.unset('Ready8X')
				layoutFile.unset('ID')
				layoutFile.unset('PatchName')
				layoutFile.unset('TargetName')
				layoutFile.save()

				const layoutOverlayPath = layoutTree.children['overlay.png']?.path
				if (!layoutOverlayPath) {
					throw new Error('Overlay file not found for ' + layoutJsonPath)
				}
			}

			// check common json
			const commonJsonPath = layoutTree.children['common.json']?.path
			if (!!commonJsonPath) {
				try {
					JSON.parse(readFileSync(commonJsonPath, 'utf-8'))
				} catch (e) {
					throw new Error(`Invalid common.json, ${commonJsonPath}`)
				}
			}
		}
	}

	console.log('All layouts are valid!')
})()
