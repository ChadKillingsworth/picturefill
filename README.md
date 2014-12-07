# Picturefill Port for Google Closure Tools
This is a port of the [Picturefill](https://github.com/scottjehl/picturefill) polyfill for responsive images.

For full documentation, see the original project.

## Using with [Closure-Library](https://developers.google.com/closure/library/)

The `picturefill` global function has been renamed. `picturefill` is now the namespace. The original picturefill function is exposed as
`picturefill.shim`.

Example:

    goog.require('picturefill');
	goog.require('picturefill.matchmedia');
	picturefill.shim();

The source files are designed to be included in a [Closure-compiler](https://developers.google.com/closure/compiler/) compilation of the project.
