import { dartboardNumbers } from '../../helpers/dartboard.js';

/*
 * Geometry shared by the SVG dartboards. The centre is 0,0 and angles run clockwise from the
 * top, in radians, so the wedge at index 0 of `dartboardNumbers` (the 20) points straight up.
 */

/** The angle one wedge spans. */
export const wedgeAngle = (Math.PI * 2) / dartboardNumbers.length;

/** The point `radius` out from the centre at `angle`. */
export const polar = (radius: number, angle: number): [ number, number ] =>
	[ radius * Math.sin(angle), -radius * Math.cos(angle) ];

/** The part of a ring between two radii and two angles, as an SVG path. */
export const arcPath = (inner: number, outer: number, start: number, end: number): string => {
	const [ x1, y1 ] = polar(outer, start);
	const [ x2, y2 ] = polar(outer, end);
	const [ x3, y3 ] = polar(inner, end);
	const [ x4, y4 ] = polar(inner, start);

	const outerArc = `A${ outer } ${ outer } 0 0 1 ${ x2 } ${ y2 }`;
	const innerArc = `A${ inner } ${ inner } 0 0 0 ${ x4 } ${ y4 }`;

	return `M${ x1 } ${ y1 } ${ outerArc } L${ x3 } ${ y3 } ${ innerArc } Z`;
};

/** A full circle as an SVG path; two of them with `fill-rule: evenodd` make a ring. */
export const circlePath = (radius: number): string =>
	`M0 ${ -radius } A${ radius } ${ radius } 0 1 1 0 ${ radius } A${ radius } ${ radius } 0 1 1 0 ${ -radius } Z`;

/** Where the wedge at `index` starts and ends: centred on its number. */
export const wedgeSpan = (index: number): [ number, number ] =>
	[ (index - 0.5) * wedgeAngle, (index + 0.5) * wedgeAngle ];
