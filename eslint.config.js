import configs from '@arcmantle/eslint-config';

export default [
	...configs.lit,
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
