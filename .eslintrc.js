module.exports = {
	root: true,
	extends: [
		'prettier',
		'prettier/vue',
		'plugin:prettier/recommended',
		'plugin:nuxt/recommended'
	],
	plugins: [
		'prettier'
	],
	// add your custom rules here
	rules: {
		"space-before-function-paren": ["off"],
	}
}
