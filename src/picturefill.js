/*! Picturefill - Responsive Images that work today.
*  A Google Closure compatible port by Chad Killingsworth
*
*  Original Author: Scott Jehl, Filament Group, 2012 ( new proposal implemented by Shawn Jansepar )
*  License: MIT/GPLv2
*  Spec: http://picture.responsiveimages.org/
*/


//goog.require('goog');
goog.provide('picturefill');

/** @const */
var picturefill = {};

/**
 * @constructor
 * @param {Image} image
 */
picturefill.Support = function(image) {
  // srcset support test
  this.srcsetSupported = 'srcset' in image;
  this.sizesSupported = 'sizes' in image;

  this.image = image;

  /** @type {number|undefined} */
  this.resizeThrottle = undefined;

  /** @type {boolean} */
  this.picturefillWorking_ = false;
};

/**
 * Get width in css pixel value from a 'length' value
 * http://dev.w3.org/csswg/css-values-3/#length-value
 * @param {string|undefined} length
 * @return {number}
 */
picturefill.Support.prototype.getWidthFromLength = function( length ) {
  // If a length is specified and doesn’t contain a percentage, and it is greater than 0 or using `calc`, use it. Else, use the `100vw` default.
  length = length && length.indexOf( '%' ) > -1 === false && ( parseFloat( length ) > 0 || length.indexOf( 'calc(' ) > -1 ) ? length : '100vw';

  /**
   * If length is specified in  `vw` units, use `%` instead since the div we’re measuring
   * is injected at the top of the document.
   *
   * TODO: maybe we should put this behind a feature test for `vw`?
   */
  length = length.replace( 'vw', '%' );

  // Create a cached element for getting length value widths
  if ( !this.lengthEl ) {
    this.lengthEl = document.createElement( 'div' );

    // Positioning styles help prevent padding/margin/width on `html` or `body` from throwing calculations off.
    this.lengthEl.style.cssText = 'border:0;display:block;font-size:1em;left:0;margin:0;padding:0;position:absolute;visibility:hidden';
  }

  this.lengthEl.style.width = length;

  document.body.appendChild(this.lengthEl);

  // Add a class, so that everyone knows where this element comes from
  this.lengthEl.className = 'helper-from-picturefill-js';

  if ( this.lengthEl.offsetWidth <= 0 ) {
    // Something has gone wrong. `calc()` is in use and unsupported, most likely. Default to `100vw` (`100%`, for broader support.):
    this.lengthEl.style.width = document.documentElement.offsetWidth + 'px';
  }

  var offsetWidth = this.lengthEl.offsetWidth;

  document.body.removeChild( this.lengthEl );

  return offsetWidth;
};

picturefill.support = new picturefill.Support(new Image);

/** 
 * container of supported mime types that one might need to qualify before using
 * @type {Object<string,(boolean|function())>}
 */
picturefill.types = {};

// Add support for standard mime types
picturefill.types['image/jpeg'] = true;
picturefill.types['image/gif'] = true;
picturefill.types['image/png'] = true;

// test svg support
picturefill.types['image/svg+xml'] = document.implementation.hasFeature('http://www.w3.org/TR/SVG11/feature#Image', '1.1');

// test webp support, only when the markup calls for it
picturefill.types['image/webp'] = function () {
  // based on Modernizr's lossless img-webp test
  // note: asynchronous
  var type = 'image/webp';

  picturefill.support.image.onerror = function () {
    picturefill.types[type] = false;
    picturefill.shim();
  };
  picturefill.support.image.onload = function () {
    picturefill.types[type] = picturefill.support.image.width === 1;
    picturefill.shim();
  };
  picturefill.support.image.src = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
};



/**
 * namespace
 * @const
 */
picturefill.ns = 'picturefill';

/**
 * @param {string} str
 * @return {string}
 */
picturefill.trim = function( str ) {
  return str.trim ? str.trim() : str.replace( /^\s+|\s+$/g, '' );
};

/**
 * just a string endsWith workaround
 * @param {string} str
 * @param {string} suffix
 * @return {boolean}
 */
picturefill.endsWith = function( str, suffix ) {
  return str.endsWith ? str.endsWith( suffix ) : str.indexOf( suffix, str.length - suffix.length ) !== -1;
};

/**
 * Shortcut method for https://w3c.github.io/webappsec/specs/mixedcontent/#restricts-mixed-content ( for easy overriding in tests )
 */
picturefill.restrictsMixedContent = function() {
  return location.protocol === 'https:';
};

/**
 * Shortcut method for matchMedia ( for easy overriding in tests )
 * @param {string} media
 * @return {boolean}
 */
picturefill.matchesMedia = function( media ) {
  return window.matchMedia && window.matchMedia( media ).matches;
};

/**
 * Shortcut method for `devicePixelRatio` ( for easy overriding in tests )
 * @return {number}
 */
picturefill.getDpr = function() {
  return ( window.devicePixelRatio || 1 );
};


/**
 * Takes a source element and checks if its type attribute is present and if so, supported
 * Note: for type tests that require a async logic,
 * you can define them as a function that'll run only if that type needs to be tested. Just make the test function call picturefill again when it is complete.
 * see the async webp test above for example
 * @param {Element} source
 * @return {string|number|boolean|undefined}
 */
picturefill.verifyTypeSupport = function( source ) {
  var type = source.getAttribute( 'type' );
  // if type attribute exists, return test result, otherwise return true
  if ( type === null || type === '' ) {
    return true;
  } else {
    // if the type test is a function, run it and return 'pending' status. The function will rerun picturefill on pending elements once finished.
    if ( typeof( picturefill.types[ type ] ) === 'function' ) {
      /** @type {function()} */ (picturefill.types[ type ])();
      return 'pending';
    } else {
      return /** @type {undefined|boolean|string} */ ( picturefill.types[ type ] );
    }
  }
};

/**
 * Parses an individual `size` and returns the length, and optional media query
 * @param {string} sourceSizeStr
 * @return {{media: ?string, length: ?string}}
 */
picturefill.parseSize = function( sourceSizeStr ) {
  var match = /(\([^)]+\))?\s*(.+)/g.exec( sourceSizeStr );
  return {
    media: match && match[1],
    length: match && match[2]
  };
};

/**
 * Takes a string of sizes and returns the width in pixels as a number
 * @param {string} sourceSizeListStr
 * @return {number}
 */
picturefill.findWidthFromSourceSize = function( sourceSizeListStr ) {
  // Split up source size list, ie ( max-width: 30em ) 100%, ( max-width: 50em ) 50%, 33%
  //                            or (min-width:30em) calc(30% - 15px)
  var sourceSizeList = picturefill.trim( sourceSizeListStr ).split( /\s*,\s*/ ),
    winningLength;

  for ( var i = 0, len = sourceSizeList.length; i < len; i++ ) {
    // Match <media-condition>? length, ie ( min-width: 50em ) 100%
    var sourceSize = sourceSizeList[ i ],
      // Split '( min-width: 50em ) 100%' into separate strings
      parsedSize = picturefill.parseSize( sourceSize ),
      length = parsedSize.length,
      media = parsedSize.media;

    if ( !length ) {
      continue;
    }
    if ( !media || picturefill.matchesMedia( media ) ) {
      // if there is no media query or it matches, choose this as our winning length
      // and end algorithm
      winningLength = length;
      break;
    }
  }

  // pass the length to a method that can properly determine length
  // in pixels based on these formats: http://dev.w3.org/csswg/css-values-3/#length-value
  return picturefill.support.getWidthFromLength( winningLength );
};

/**
 * A lot of this was pulled from Boris Smus’ parser for the now-defunct WHATWG `srcset`
 * https://github.com/borismus/srcset-polyfill/blob/master/js/srcset-info.js
 *
 * 1. Let input (`srcset`) be the value passed to this algorithm.
 * 2. Let position be a pointer into input, initially pointing at the start of the string.
 * 3. Let raw candidates be an initially empty ordered list of URLs with associated
 *    unparsed descriptors. The order of entries in the list is the order in which entries
 *    are added to the list.
 *
 * @param {string} srcset
 * @return {Array<{url: string, descriptor: string}>}
 */
picturefill.parseSrcset = function( srcset ) {
  
  var candidates = [];

  while ( srcset !== '' ) {
    srcset = srcset.replace( /^\s+/g, '' );

    // 5. Collect a sequence of characters that are not space characters, and let that be url.
    var pos = srcset.search(/\s/g),
      url, descriptor = null;

    if ( pos !== -1 ) {
      url = srcset.slice( 0, pos );

      var last = url.slice(-1);

      // 6. If url ends with a U+002C COMMA character (,), remove that character from url
      // and let descriptors be the empty string. Otherwise, follow these substeps
      // 6.1. If url is empty, then jump to the step labeled descriptor parser.

      if ( last === ',' || url === '' ) {
        url = url.replace( /,+$/, '' );
        descriptor = '';
      }
      srcset = srcset.slice( pos + 1 );

      // 6.2. Collect a sequence of characters that are not U+002C COMMA characters (,), and
      // let that be descriptors.
      if ( descriptor === null ) {
        var descpos = srcset.indexOf( ',' );
        if ( descpos !== -1 ) {
          descriptor = srcset.slice( 0, descpos );
          srcset = srcset.slice( descpos + 1 );
        } else {
          descriptor = srcset;
          srcset = '';
        }
      }
    } else {
      url = srcset;
      srcset = '';
    }

    // 7. Add url to raw candidates, associated with descriptors.
    if ( url || descriptor ) {
      candidates.push({
        url: url,
        descriptor: descriptor
      });
    }
  }
  return candidates;
};

/**
 * 11. Descriptor parser: Let candidates be an initially empty source set. The order of entries in the list
 * is the order in which entries are added to the list.
 *
 * @param {string|undefined} descriptor
 * @param {string|undefined} sizesattr
 */
picturefill.parseDescriptor = function( descriptor, sizesattr ) {
  var sizes = sizesattr || '100vw',
    sizeDescriptor = descriptor && descriptor.replace( /(^\s+|\s+$)/g, '' ),
    widthInCssPixels = picturefill.findWidthFromSourceSize( sizes ),
    resCandidate;

  if ( sizeDescriptor ) {
    var splitDescriptor = sizeDescriptor.split(' ');

    for (var i = splitDescriptor.length - 1; i >= 0; i--) {
      var curr = splitDescriptor[ i ],
        lastchar = curr && curr.slice( curr.length - 1 );

      if ( ( lastchar === 'h' || lastchar === 'w' ) && !picturefill.support.sizesSupported ) {
        resCandidate = parseFloat( ( parseInt( curr, 10 ) / widthInCssPixels ) );
      } else if ( lastchar === 'x' ) {
        var res = curr && parseFloat( curr );
        resCandidate = res && !isNaN( res ) ? res : 1;
      }
    }
  }
  return resCandidate || 1;
};

/**
 * Takes a srcset in the form of url/
 * ex. 'images/pic-medium.png 1x, images/pic-medium-2x.png 2x' or
 *     'images/pic-medium.png 400w, images/pic-medium-2x.png 800w' or
 *     'images/pic-small.png'
 * Get an array of image candidates in the form of
 *      {url: '/foo/bar.png', resolution: 1}
 * where resolution is http://dev.w3.org/csswg/css-values-3/#resolution-value
 * If sizes is specified, resolution is calculated
 *
 * @param {string} srcset
 * @param {string=} sizes
 * @return {Array<{url:string, resolution: number}>}
 */
picturefill.getCandidatesFromSourceSet = function( srcset, sizes ) {
  var candidates = picturefill.parseSrcset( srcset ),
    formattedCandidates = [];

  for ( var i = 0, len = candidates.length; i < len; i++ ) {
    var candidate = candidates[ i ];

    formattedCandidates.push({
      url: candidate.url,
      resolution: picturefill.parseDescriptor( candidate.descriptor, sizes )
    });
  }
  return formattedCandidates;
};

/**
 * if it's an img element and it has a srcset property,
 * we need to remove the attribute so we can manipulate src
 * (the property's existence infers native srcset support, and a srcset-supporting browser will prioritize srcset's value over our winning picture candidate)
 * this moves srcset's value to memory for later use and removes the attr
 *
 * @param {HTMLImageElement} img
 */
picturefill.dodgeSrcset = function( img ) {
  if ( img.srcset ) {
    img[ picturefill.ns ]['srcset'] = img.srcset;
    img.srcset = '';
    img.setAttribute( 'data-pfsrcset', img[ picturefill.ns ]['srcset'] );
  }
};

/**
 * Accept a source or img element and process its srcset and sizes attrs
 *
 * @param {Element} el
 * @return {Array<{url:string, resolution: number}>}
 */
picturefill.processSourceSet = function( el ) {
  var srcset = el.getAttribute( 'srcset' ),
    sizes = el.getAttribute( 'sizes' ),
    candidates = [];

  // if it's an img element, use the cached srcset property (defined or not)
  if ( el.nodeName.toUpperCase() === 'IMG' && el[ picturefill.ns ] && el[ picturefill.ns ]['srcset'] ) {
    srcset = el[ picturefill.ns ]['srcset'];
  }

  if ( srcset ) {
    candidates = picturefill.getCandidatesFromSourceSet( srcset, sizes );
  }
  return candidates;
};

/**
 * @param {HTMLImageElement} picImg
 */
picturefill.backfaceVisibilityFix = function( picImg ) {
  // See: https://github.com/scottjehl/picturefill/issues/332
  var style = picImg.style || {},
    WebkitBackfaceVisibility = 'webkitBackfaceVisibility' in style,
    currentZoom = style.zoom;

  if (WebkitBackfaceVisibility) { 
    style.zoom = '.999';

    WebkitBackfaceVisibility = picImg.offsetWidth;

    style.zoom = currentZoom;
  }
};

/**
 * @param {number} res
 * @param {Element} picImg
 */
picturefill.setWidth = function( res, picImg ) {
  if ( picImg.setAttribute ) {
    picImg.setAttribute( 'width', picImg.naturalWidth / res );
  }
};

/**
 * @param {number} res
 * @param {HTMLImageElement} picImg
 * @param {string=} readyState
 */
picturefill.setInherentSize = function( res, picImg, readyState ) {
  var ready = readyState !== undefined ? readyState : picImg.complete,
    widthPreset = !ready && picImg.getAttribute && picImg.getAttribute( 'width' ) !== null;

  if ( ready && res && !widthPreset ) {
    picturefill.setWidth( res, picImg );
  }
  if ( !ready ) {
    setTimeout(
        goog.partial(picturefill.setInherentSize, res, picImg, picImg.complete),
        250);
  }
};

/** 
 * @param {Array<{url: string, resolution: number}>} candidates
 * @param {HTMLImageElement} picImg
 */
picturefill.applyBestCandidate = function( candidates, picImg ) {
  var candidate,
    length,
    bestCandidate;

  candidates.sort( picturefill.ascendingSort );

  length = candidates.length;
  bestCandidate = candidates[ length - 1 ];

  for ( var i = 0; i < length; i++ ) {
    candidate = candidates[ i ];
    if ( candidate.resolution >= picturefill.getDpr() ) {
      bestCandidate = candidate;
      break;
    }
  }

  if ( bestCandidate && !picturefill.endsWith( picImg.src, bestCandidate.url ) ) {
    if ( picturefill.restrictsMixedContent() && bestCandidate.url.substr(0, 'http:'.length).toLowerCase() === 'http:' ) {
      if ( window.console !== undefined ) {
        console.warn( 'Blocked mixed content image ' + bestCandidate.url );
      }
    } else {
      picImg.src = bestCandidate.url;
      // currentSrc attribute and property to match
      // http://picture.responsiveimages.org/#the-img-element
      picImg.currentSrc = picImg.src;

      picturefill.backfaceVisibilityFix( picImg );
      picturefill.setInherentSize( bestCandidate.resolution, picImg );
    }
  }
};

/**
 * @param {{resolution: number}} a
 * @param {{resolution: number}} b
 * @return {number}
 */
picturefill.ascendingSort = function( a, b ) {
  return a.resolution - b.resolution;
};

/**
 * In IE9, <source> elements get removed if they aren't children of
 * video elements. Thus, we conditionally wrap source elements
 * using <!--[if IE 9]><video style='display: none;'><![endif]-->
 * and must account for that here by moving those source elements
 * back into the picture element.
 *
 * @param {Element} picture
 */
picturefill.removeVideoShim = function( picture ) {
  var videos = picture.getElementsByTagName( 'video' );
  if ( videos.length ) {
    var video = videos[ 0 ],
      vsources = video.getElementsByTagName( 'source' );
    while ( vsources.length ) {
      picture.insertBefore( vsources[ 0 ], video );
    }
    // Remove the video element once we're finished removing its children
    video.parentNode.removeChild( video );
  }
};

/**
 * Find all `img` elements, and add them to the candidate list if they have
 * a `picture` parent, a `sizes` attribute in basic `srcset` supporting browsers,
 * a `srcset` attribute at all, and they haven’t been evaluated already.
 *
 * @return {Array<Element>}
 */
picturefill.getAllElements = function() {
  var elems = [],
    imgs = document.getElementsByTagName( 'img' );

  for ( var h = 0, len = imgs.length; h < len; h++ ) {
    var currImg = imgs[ h ];

    if ( currImg.parentNode.nodeName.toUpperCase() === 'PICTURE' ||
    ( currImg.getAttribute( 'srcset' ) !== null ) || currImg[ picturefill.ns ] && currImg[ picturefill.ns ]['srcset'] !== null ) {
      elems.push( currImg );
    }
  }
  return elems;
};

/**
 * @param {HTMLImageElement} img
 * @param {Element} picture
 * @return {!HTMLImageElement|undefined|boolean}
 */
picturefill.getMatch = function( img, picture ) {
  var sources = picture.childNodes;

  /** @type {!HTMLImageElement|undefined} */
  var match;

  // Go through each child, and if they have media queries, evaluate them
  for ( var j = 0, slen = sources.length; j < slen; j++ ) {
    var source = sources[ j ];

    // ignore non-element nodes
    if ( source.nodeType !== 1 ) {
      continue;
    }

    // Hitting the `img` element that started everything stops the search for `sources`.
    // If no previous `source` matches, the `img` itself is evaluated later.
    if ( source === img ) {
      return match;
    }

    // ignore non-`source` nodes
    if ( source.nodeName.toUpperCase() !== 'SOURCE' ) {
      continue;
    }
    // if it's a source element that has the `src` property set, throw a warning in the console
    if ( source.getAttribute( 'src' ) !== null && typeof console !== undefined ) {
      console.warn('The `src` attribute is invalid on `picture` `source` element; instead, use `srcset`.');
    }

    var media = source.getAttribute( 'media' );

    // if source does not have a srcset attribute, skip
    if ( !source.getAttribute( 'srcset' ) ) {
      continue;
    }

    // if there's no media specified, OR w.matchMedia is supported
    if ( ( !media || picturefill.matchesMedia( media ) ) ) {
      var typeSupported = picturefill.verifyTypeSupport( source );

      if ( typeSupported === true ) {
        match = source;
        break;
      } else if ( typeSupported === 'pending' ) {
        return false;
      }
    }
  }

  return match;
};

/** @param {{elements: (Array<Element>|NodeList), reevaluate: (boolean|undefined)}=} opt */
picturefill.shim = function ( opt ) {
  var elements,
    element,
    parent,
    firstMatch,
    candidates,
    options = opt || {};

  elements = options['elements'] || picturefill.getAllElements();

  // Loop through all elements
  for ( var i = 0, plen = elements.length; i < plen; i++ ) {
    element = elements[ i ];
    parent = element.parentNode;
    firstMatch = undefined;
    candidates = undefined;

    // immediately skip non-`img` nodes
    if ( element.nodeName.toUpperCase() !== 'IMG' ) {
      continue;
    }

    // expando for caching data on the img
    if ( !element[ picturefill.ns ] ) {
      element[ picturefill.ns ] = {};
    }

    // if the element has already been evaluated, skip it unless
    // `options.reevaluate` is set to true ( this, for example,
    // is set to true when running `picturefill` on `resize` ).
    if ( !options['reevaluate'] && element[ picturefill.ns ]['evaluated'] ) {
      continue;
    }

    // if `img` is in a `picture` element
    if ( parent.nodeName.toUpperCase() === 'PICTURE' ) {

      // IE9 video workaround
      picturefill.removeVideoShim( parent );

      // return the first match which might undefined
      // returns false if there is a pending source
      // TODO the return type here is brutal, cleanup
      firstMatch = picturefill.getMatch( element, parent );

      // if any sources are pending in this picture due to async type test(s)
      // remove the evaluated attr and skip for now ( the pending test will
      // rerun picturefill on this element when complete)
      if ( firstMatch === false ) {
        continue;
      }
    } else {
      firstMatch = undefined;
    }

    // Cache and remove `srcset` if present and we’re going to be doing `picture`/`srcset`/`sizes` polyfilling to it.
    if ( parent.nodeName.toUpperCase() === 'PICTURE' ||
    ( element.srcset && !picturefill.support.srcsetSupported ) ||
    ( !picturefill.support.sizesSupported && ( element.srcset && element.srcset.indexOf('w') > -1 ) ) ) {
      picturefill.dodgeSrcset( element );
    }

    if ( firstMatch ) {
      candidates = picturefill.processSourceSet( /** @type {HTMLImageElement} */ (firstMatch) );
      picturefill.applyBestCandidate( candidates, element );
    } else {
      // No sources matched, so we’re down to processing the inner `img` as a source.
      candidates = picturefill.processSourceSet( element );

      if ( element.srcset === undefined || element[ picturefill.ns ]['srcset'] ) {
        // Either `srcset` is completely unsupported, or we need to polyfill `sizes` functionality.
        picturefill.applyBestCandidate( candidates, element );
      } // Else, resolution-only `srcset` is supported natively.
    }

    // set evaluated to true to avoid unnecessary reparsing
    element[ picturefill.ns ]['evaluated'] = true;
  }
};

picturefill.checkResize = function() {
  if ( !picturefill.support.picturefillWorking_ ) {
    picturefill.support.picturefillWorking_ = true;
    window.clearTimeout( picturefill.support.resizeThrottle );
    picturefill.support.resizeThrottle = setTimeout( picturefill.afterResize_, 60 );
  }
};

picturefill.afterResize_ = function() {
  picturefill.shim({ 'reevaluate': true, 'elements': null });
  picturefill.support.picturefillWorking_ = false;
};

picturefill.init = function () {
  // If picture is supported, well, that's awesome. Let's get outta here...
  if (window.HTMLPictureElement) {
    return;
  }

  // HTML shim|v it for old IE (IE9 will still need the HTML video tag workaround)
  document.createElement('picture');

  picturefill.shim();

  if (window.addEventListener) {
    window.addEventListener('resize', picturefill.checkResize, false);
  } else if (window.attachEvent) {
    window.attachEvent('onresize', picturefill.checkResize);
  }
};

picturefill.init();
