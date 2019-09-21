import { string_literal } from '../../utils/stringify';
import { quote_name_if_necessary } from '../../../utils/names';
import Renderer, { RenderOptions } from '../Renderer';
import { get_slot_scope } from './shared/get_slot_scope';
import InlineComponent from '../../nodes/InlineComponent';
import { INode } from '../../nodes/interfaces';
import { p, x } from 'code-red';

function get_prop_value(attribute) {
	if (attribute.is_true) return x`true`;
	if (attribute.chunks.length === 0) return x`''`;

	return attribute.chunks
		.map(chunk => {
			if (chunk.type === 'Text') return string_literal(chunk.data);
			return chunk.node;
		})
		.reduce((lhs, rhs) => x`${lhs} + ${rhs}`);
}

export default function(node: InlineComponent, renderer: Renderer, options: RenderOptions) {
	const binding_props = [];
	const binding_fns = [];

	node.bindings.forEach(binding => {
		renderer.has_bindings = true;

		// TODO this probably won't work for contextual bindings
		const snippet = binding.expression.node;

		binding_props.push(p`${binding.name}: ${snippet}`);
		binding_fns.push(p`${binding.name}: $$value => { ${snippet} = $$value; $$settled = false }`);
	});

	const uses_spread = node.attributes.find(attr => attr.is_spread);

	let props;

	if (uses_spread) {
		props = `@_Object.assign(${
			node.attributes
				.map(attribute => {
					if (attribute.is_spread) {
						return snip(attribute.expression);
					} else {
						return `{ ${quote_name_if_necessary(attribute.name)}: ${get_prop_value(attribute)} }`;
					}
				})
				.concat(binding_props.map(p => `{ ${p} }`))
				.join(', ')
		})`;
	} else {
		props = x`{
			${node.attributes.map(attribute => p`${attribute.name}: ${get_prop_value(attribute)}`)},
			${binding_props}
		}`;
	}

	const bindings = x`{
		${binding_fns}
	}`;

	const expression = (
		node.name === 'svelte:self'
			? '__svelte:self__' // TODO conflict-proof this
			: node.name === 'svelte:component'
				? `((${snip(node.expression)}) || @missing_component)`
				: node.name
	);

	const slot_fns = [];

	if (node.children.length) {
		const slot_scopes = new Map();

		renderer.push();

		renderer.render(node.children, Object.assign({}, options, {
			slot_scopes
		}));

		slot_scopes.set('default', {
			input: get_slot_scope(node.lets),
			output: renderer.pop()
		});

		slot_scopes.forEach(({ input, output }, name) => {
			slot_fns.push(
				p`${name}: (${input}) => ${output}`
			);
		});
	}

	const slots = x`{
		${slot_fns}
	}`;

	renderer.add_expression(x`@validate_component(${expression}, "${node.name}").$$render($$result, ${props}, ${bindings}, ${slots})`);
}
