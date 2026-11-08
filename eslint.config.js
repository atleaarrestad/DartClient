import configs from '@arcmantle/eslint-config';
import globals from 'globals';

export default [
	...configs.lit,
	{
		files:           [ 'scripts/**/*.js', 'vite.config.ts' ],
		languageOptions: { globals: globals.node },
	},
	{
		files: [ 'src/components/**/*.ts', 'src/ui/**/*.ts' ],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "TaggedTemplateExpression[tag.name='css']",
					message:  'Move component styles to a colocated CSS file.',
				},
			],
		},
	},
];
