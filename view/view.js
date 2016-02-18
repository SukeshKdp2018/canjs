// # can/view/view.js
// -------
// `can.view`
// _Templating abstraction._
// can.view loads templates based on a registered type, and given a set of data, returns a document fragment
// from the template engine's rendering method
//
steal('can/util', function(can){

	var isFunction = can.isFunction,
		makeArray = can.makeArray,
		// Used for hookup `id`s.
		hookupId = 1;

	// internal utility methods
	// ------------------------

	// ##### makeRenderer
	/**
	 * @hide
	 * Rendering function factory method
	 * @param textRenderer
	 * @return {renderer}
	 */
	var makeRenderer = function(textRenderer) {
		var renderer = function() {
			return $view.frag(textRenderer.apply(this, arguments));
		};
		renderer.render = function() {
			return textRenderer.apply(textRenderer, arguments);
		};
		return renderer;
	};

	// ##### checkText
	// Makes sure there's a template, if not, have `steal` provide a warning.
	var checkText = function (text, url) {
		if (!text.length) {

			// _removed if not used as a steal module_

			//!steal-remove-start
			can.dev.log("can/view/view.js: There is no template or an empty template at " + url);
			//!steal-remove-end

			throw new Error("can.view: No template or empty template:" + url);
		}
	};

	// ##### get
	// get a deferred renderer for provided url
	/**
	 * @hide
	 * @function get
	 * @param {String | Object} obj url string or object with url property
	 * @param {Boolean} async If the ajax request should be asynchronous.
	 * @return {can.Deferred} a `view` renderer deferred.
	 */
	var	getRenderer = function (obj, async) {
		// If `obj` already is a renderer function just resolve a Deferred with it
		if(isFunction(obj)) {
			var def = can.Deferred();
			return def.resolve(obj);
		}

		var url = typeof obj === 'string' ? obj : obj.url,
			suffix = (obj.engine && '.' + obj.engine) || url.match(/\.[\w\d]+$/),
			type,
		// If we are reading a script element for the content of the template,
		// `el` will be set to that script element.
			el,
		// A unique identifier for the view (used for caching).
		// This is typically derived from the element id or
		// the url for the template.
			id;

		//If the url has a #, we assume we want to use an inline template
		//from a script element and not current page's HTML
		if (url.match(/^#/)) {
			url = url.substr(1);
		}
		// If we have an inline template, derive the suffix from the `text/???` part.
		// This only supports `<script>` tags.
		if (el = document.getElementById(url)) {
			suffix = '.' + el.type.match(/\/(x\-)?(.+)/)[2];
		}

		// If there is no suffix, add one.
		if (!suffix && !$view.cached[url]) {
			url += suffix = $view.ext;
		}

		// if the suffix was derived from the .match() operation, pluck out the first value
		if (can.isArray(suffix)) {
			suffix = suffix[0];
		}

		// Convert to a unique and valid id.
		id = $view.toId(url);

		// If an absolute path, use `steal`/`require` to get it.
		// You should only be using `//` if you are using an AMD loader like `steal` or `require` (not almond).
		if (url.match(/^\/\//)) {
			url = url.substr(2);
			url = !window.steal ?
				url :
				steal.config()
					.root.mapJoin("" + steal.id(url));
		}

		// Localize for `require` (not almond)
		if (window.require) {
			if (require.toUrl) {
				url = require.toUrl(url);
			}
		}

		// Set the template engine type.
		type = $view.types[suffix];

		// If it is cached,
		if ($view.cached[id]) {
			// Return the cached deferred renderer.
			return $view.cached[id];

			// Otherwise if we are getting this from a `<script>` element.
		} else if (el) {
			// Resolve immediately with the element's `innerHTML`.
			return $view.registerView(id, el.innerHTML, type);
		} else {
			// Make an ajax request for text.
			var d = new can.Deferred();
			can.ajax({
				async: async,
				url: url,
				dataType: 'text',
				error: function (jqXHR) {
					checkText('', url);
					d.reject(jqXHR);
				},
				success: function (text) {
					// Make sure we got some text back.
					checkText(text, url);
					$view.registerView(id, text, type, d);
				}
			});
			return d;
		}
	};
	// ##### getDeferreds
	// Gets an `array` of deferreds from an `object`.
	// This only goes one level deep.
	/**
	 * @hide
	 * @param {Object|can.Deferred} data
	 * @return {Array} deferred objects
	 */
	var getDeferreds = function (data) {
		var deferreds = [];

		// pull out deferreds
		if (can.isDeferred(data)) {
			return [data];
		} else {
			for (var prop in data) {
				if (can.isDeferred(data[prop])) {
					deferreds.push(data[prop]);
				}
			}
		}
		return deferreds;
	};

	// ##### usefulPart
	// Gets the useful part of a resolved deferred.
	// When a jQuery.when is resolved, it returns an array to each argument.
	// Reference ($.when)[https://api.jquery.com/jQuery.when/]
	// This is for `model`s and `can.ajax` that resolve to an `array`.
	/**
	 * @hide
	 * @function usefulPart
	 * @param {Array|*} resolved
	 * @return {*}
	 */
	var usefulPart = function (resolved) {
		return can.isArray(resolved) && resolved[1] === 'success' ? resolved[0] : resolved;
	};

	// #### can.view
	//defines $view for internal use, can.template for backwards compatibility
	/**
	 * @add can.view
	 */
	var $view = can.view = can.template = function (view, data, helpers, callback) {
		// If helpers is a `function`, it is actually a callback.
		if (isFunction(helpers)) {
			callback = helpers;
			helpers = undefined;
		}

		// Render the view as a fragment
		return $view.renderAs("fragment",view, data, helpers, callback);
	};

	// can.view methods
	// --------------------------
	can.extend($view, {
		// ##### frag
		// creates a fragment and hooks it up all at once
		/**
		 * @function can.view.frag frag
		 * @parent can.view.static
		 */
		frag: function (result, parentNode) {
			return $view.hookup($view.fragment(result), parentNode);
		},

		// #### fragment
		// this is used internally to create a document fragment, insert it,then hook it up
		fragment: function (result) {
			return can.frag(result, document);
		},

		// ##### toId
		// Convert a path like string into something that's ok for an `element` ID.
		toId: function (src) {
			return can.map(src.toString()
				.split(/\/|\./g), function (part) {
					// Dont include empty strings in toId functions
					if (part) {
						return part;
					}
				})
				.join('_');
		},
		// ##### toStr
        // convert argument to a string
		toStr: function(txt){
			return txt == null ? "" : ""+txt;
		},

		// ##### hookup
		// attach the provided `fragment` to `parentNode`
		/**
		 * @hide
		 * hook up a fragment to its parent node
		 * @param fragment
		 * @param parentNode
		 * @return {*}
		 */
		hookup: function (fragment, parentNode) {
			var hookupEls = [],
				id,
				func;

			// Get all `childNodes`.
			can.each(fragment.childNodes ? can.makeArray(fragment.childNodes) : fragment, function (node) {
				if (node.nodeType === 1) {
					hookupEls.push(node);
					hookupEls.push.apply(hookupEls, can.makeArray(node.getElementsByTagName('*')));
				}
			});

			// Filter by `data-view-id` attribute.
			can.each(hookupEls, function (el) {
				if (el.getAttribute && (id = el.getAttribute('data-view-id')) && (func = $view.hookups[id])) {
					func(el, parentNode, id);
					delete $view.hookups[id];
					el.removeAttribute('data-view-id');
				}
			});

			return fragment;
		},

		// `hookups` keeps list of pending hookups, ie fragments to attach to a parent node
		/**
		 * @property hookups
		 * @hide
		 * A list of pending 'hookups'
		 */
		hookups: {},

		// `hook` factory method for hookup function inserted into templates
		// hookup functions are called after the html is rendered to the page
		// only implemented by EJS templates.
		/**
		 * @description Create a hookup to insert into templates.
		 * @function can.view.hook hook
		 * @parent can.view.static
		 * @signature `can.view.hook(callback)`
		 * @param {Function} callback A callback function to be called with the element.
		 *
		 * @body
		 * Registers a hookup function that can be called back after the html is
		 * put on the page.  Typically this is handled by the template engine.  Currently
		 * only EJS supports this functionality.
		 *
		 *     var id = can.view.hook(function(el){
		 *            //do something with el
		 *         }),
		 *         html = "<div data-view-id='"+id+"'>"
		 *     $('.foo').html(html);
		 */
		hook: function (cb) {
			$view.hookups[++hookupId] = cb;
			return ' data-view-id=\'' + hookupId + '\'';
		},

		/**
		 * @hide
		 * @property {Object} can.view.cached view
		 * @parent can.view
		 * Cached are put in this object
		 */
		cached: {},
		cachedRenderers: {},

		// cache view templates resolved via XHR on the client
		/**
		 * @property {Boolean} can.view.cache cache
		 * @parent can.view.static
		 * By default, views are cached on the client.  If you'd like the
		 * the views to reload from the server, you can set the `cache` attribute to `false`.
		 *
		 *	//- Forces loads from server
		 *	can.view.cache = false;
		 *
		 */
		cache: true,

		// ##### register
		// given an info object, register a template type
		// different templating solutions produce strings or document fragments via their renderer function
		/**
		 * @function can.view.register register
		 * @parent can.view.static
		 * @description Register a templating language.
		 * @signature `can.view.register(info)`
		 * @param {{}} info Information about the templating language.
		 * @option {String} plugin The location of the templating language's plugin.
		 * @option {String} suffix Files with this suffix will use this templating language's plugin by default.
		 * @option {function} renderer A function that returns a function that, given data, will render the template with that data.
		 * The __renderer__ function receives the id of the template and the text of the template.
		 * @option {function} script A function that returns the string form of the processed template.
		 *
		 * @body
		 * Registers a template engine to be used with
		 * view helpers and compression.
		 *
		 * ## Example
		 *
		 * ```
		 * can.View.register({
		 *	suffix : "tmpl",
		 *  plugin : "jquery/view/tmpl",
		 *	renderer: function( id, text ) {
		 *	return function(data){
		 *		return jQuery.render( text, data );
		 *		}
		 *	},
		 *	script: function( id, text ) {
		 *	var tmpl = can.tmpl(text).toString();
		 *	return "function(data){return ("+
		 *			tmpl+
		 *			").call(jQuery, jQuery, data); }";
		 *	}
		 * })
		 * ```
		 */
		register: function (info) {
			this.types['.' + info.suffix] = info;

			// _removed if not used as a steal module_

			//!steal-remove-start
			if ( typeof window !== "undefined" && window.steal && steal.type ) {
				steal.type(info.suffix + " view js", function (options, success, error) {
					var type = $view.types["." + options.type],
						id = $view.toId(options.id + '');
					options.text = type.script(id, options.text);
					success();
				});
			}
			//!steal-remove-end

			can[info.suffix] = $view[info.suffix] = function (id, text) {
				var renderer,
					renderFunc;
				// If there is no text, assume id is the template text, so return a nameless renderer.
				if (!text) {
					renderFunc = function(){
						if(!renderer){
							// if the template has a fragRenderer already, just return that.
							if(info.fragRenderer) {
								renderer = info.fragRenderer(null, id);
							} else {
								renderer = makeRenderer(info.renderer(null, id));
							}
						}
						return renderer.apply(this, arguments);
					};
					renderFunc.render = function() {
						var textRenderer = info.renderer(null, id);
						return textRenderer.apply(textRenderer, arguments);
					};
					return renderFunc;
				}
				var registeredRenderer = function(){
					if(!renderer){
						if(info.fragRenderer) {
							renderer = info.fragRenderer(id, text);
						} else {
							renderer = info.renderer(id, text);
						}
					}
					return renderer.apply(this, arguments);
				};
				if(info.fragRenderer) {
					return $view.preload( id, registeredRenderer );
				} else {
					return $view.preloadStringRenderer(id, registeredRenderer);
				}

			};

		},

		//registered view types
		types: {},

		/**
		 * @property {String} can.view.ext ext
		 * @parent can.view.static
		 * The default suffix to use if none is provided in the view's url.
		 * This is set to `.ejs` by default.
		 *
		 *	// Changes view ext to 'txt'
		 *	can.view.ext = 'txt';
		 *
		 */
		ext: ".ejs",

		/**
		 * Returns the text from a script tag
		 * @hide
		 * @param {Object} type
		 * @param {Object} id
		 * @param {Object} src
		 */
		registerScript: function (type, id, src) {
			return 'can.view.preloadStringRenderer(\'' + id + '\',' + $view.types['.' + type].script(id, src) + ');';
		},

		/**
		 * @hide
		 * Called by a production script to pre-load a fragment renderer function
		 * into the view cache.
		 * @param {String} id
		 * @param {Function} renderer
		 */
		preload: function (id, renderer) {
			var def = $view.cached[id] = new can.Deferred()
				.resolve(function (data, helpers) {
					return renderer.call(data, data, helpers);
				});

			// set cache references (otherwise preloaded recursive views won't recurse properly)
			def.__view_id = id;
			$view.cachedRenderers[id] = renderer;

			return renderer;
		},

		/**
		 * @hide
		 * Called by a production script to pre-load a string renderer function
		 * into the view cache.
		 * @param id
		 * @param stringRenderer
		 * @return {*}
		 */
		preloadStringRenderer: function(id, stringRenderer) {
			return this.preload(id, makeRenderer(stringRenderer) );
		},

		// #### renderers
		// ---------------
		// can.view's primary purpose is to load templates (from strings or filesystem) and render them
		//
		// can.view supports two different forms of rendering systems
		//
		// mustache templates return a string based rendering function

		// stache (or other fragment based templating systems) return a document fragment, so 'hookup' steps are not required
		//
		// ##### render
		//
		/**
		 * @function can.view.render render
		 * @parent can.view.static
		 * @description Render a template.
		 * @signature `can.view.render(template[, callback])`
		 * @param {String|Object} view The path of the view template or a view object.
		 * @param {Function} [callback] A function executed after the template has been processed.
		 * @return {Function|can.Deferred} A renderer function to be called with data and helpers
		 * or a Deferred that resolves to a renderer function.
		 *
		 * @signature `can.view.render(template, data[, [helpers,] callback])`
		 * @param {String|Object} view The path of the view template or a view object.
		 * @param {Object} [data] The data to populate the template with.
		 * @param {Object.<String, function>} [helpers] Helper methods referenced in the template.
		 * @param {Function} [callback] A function executed after the template has been processed.
		 * @param {NodeList} nodelist parent nodelist to register partial template contents with
		 * @return {String|can.Deferred} The template with interpolated data in string form
		 * or a Deferred that resolves to the template with interpolated data.
		 *
		 * @body
		 * `can.view.render(view, [data], [helpers], callback)` returns the rendered markup produced by the corresponding template
		 * engine as String. If you pass a deferred object in as data, render returns
		 * a deferred resolving to the rendered markup.
		 *
		 * `can.view.render` is commonly used for sub-templates.
		 *
		 * ## Example
		 *
		 * _welcome.ejs_ looks like:
		 *
		 *     <h1>Hello <%= hello %></h1>
		 *
		 * Render it to a string like:
		 *
		 *     can.view.render("welcome.ejs",{hello: "world"})
		 *       //-> <h1>Hello world</h1>
		 *
		 * ## Use as a Subtemplate
		 *
		 * If you have a template like:
		 *
		 *     <ul>
		 *       <% list(items, function(item){ %>
		 *         <%== can.view.render("item.ejs",item) %>
		 *       <% }) %>
		 *     </ul>
		 *
		 * ## Using renderer functions
		 *
		 * If you only pass the view path, `can.view will return a renderer function that can be called with
		 * the data to render:
		 *
		 *     var renderer = can.view.render("welcome.ejs");
		 *     // Do some more things
		 *     renderer({hello: "world"}) // -> Document Fragment
		 *
		 */
		//call `renderAs` with a hardcoded string, as view.render
		// always operates against resolved template files or hardcoded strings
		render: function (view, data, helpers, callback, nodelist) {
			return can.view.renderAs("string",view, data, helpers, callback, nodelist);
		},

		// ##### renderTo
		//
		/**
		 * @hide
		 * @function renderTo
		 * @param {String} format
		 * @param {Function} renderer
		 * @param data
		 * @param {Object} helpers helper methods for this template
		 * @param {NodeList} nodelist parent nodelist to register partial template contents with
		 * @return {*}
		 */
		renderTo: function(format, renderer, data, helpers, nodelist){
			return (format === "string" && renderer.render ? renderer.render : renderer)(data, helpers, nodelist);
		},

		/**
		 * @hide
		 *
		 * @param format
		 * @param view
		 * @param data
		 * @param helpers
		 * @param callback
		 * @param nodelist
		 * @return {*}
		 */
		renderAs: function (format, view, data, helpers, callback, nodelist) {
			// if callback has expression prop its actually the nodelist
			if (callback !== undefined && typeof callback.expression === 'string') {
				nodelist = callback;
				callback = undefined;
			}
			
			// If helpers is a `function`, it is actually a callback.
			if (isFunction(helpers)) {
				callback = helpers;
				helpers = undefined;
			}

			// See if we got passed any deferreds.
			var deferreds = getDeferreds(data);
			var deferred, dataCopy, async, response;
			if (deferreds.length) {
				// Does data contain any deferreds?
				// The deferred that resolves into the rendered content...
				deferred = new can.Deferred();
				dataCopy = can.extend({}, data);

				// Add the view request to the list of deferreds.
				deferreds.push(getRenderer(view, true));
				// Wait for the view and all deferreds to finish...
				can.when.apply(can, deferreds)
					.then(function (resolved) {
						// Get all the resolved deferreds.
						var objs = makeArray(arguments),
							// Renderer is the last index of the data.
							renderer = objs.pop(),
							// The result of the template rendering with data.
							result;

						// Make data look like the resolved deferreds.
						if (can.isDeferred(data)) {
							dataCopy = usefulPart(resolved);
						} else {
							// Go through each prop in data again and
							// replace the defferreds with what they resolved to.
							for (var prop in data) {
								if (can.isDeferred(data[prop])) {
									dataCopy[prop] = usefulPart(objs.shift());
								}
							}
						}

						// Get the rendered result.
						result = can.view.renderTo(format, renderer, dataCopy, helpers, nodelist);

						// Resolve with the rendered view.
						deferred.resolve(result, dataCopy);

						// If there's a `callback`, call it back with the result.
						if (callback) {
							callback(result, dataCopy);
						}
					}, function () {
						deferred.reject.apply(deferred, arguments);
					});
				// Return the deferred...
				return deferred;
			} else {

				// If there's a `callback` function
				async = isFunction(callback);
				
				// get is called async but in
				// ff will be async so we need to temporarily reset
				deferred = can.__notObserve(getRenderer)(view, async);

				// If we are `async`...
				if (async) {
					// Return the deferred
					response = deferred;
					// And fire callback with the rendered result.
					deferred.then(function (renderer) {
						callback(data ? can.view.renderTo(format, renderer, data, helpers, nodelist) : renderer);
					});
				} else {
					// if the deferred is resolved, call the cached renderer instead
					// this is because it's possible, with recursive deferreds to
					// need to render a view while its deferred is _resolving_.  A _resolving_ deferred
					// is a deferred that was just resolved and is calling back it's success callbacks.
					// If a new success handler is called while resoliving, it does not get fired by
					// jQuery's deferred system.  So instead of adding a new callback
					// we use the cached renderer.
					// We also add __view_id on the deferred so we can look up it's cached renderer.
					// In the future, we might simply store either a deferred or the cached result.
					if (deferred.state() === 'resolved' && deferred.__view_id) {
						var currentRenderer = $view.cachedRenderers[deferred.__view_id];
						return data ? can.view.renderTo(format, currentRenderer, data, helpers, nodelist) : currentRenderer;
					} else {
						// Otherwise, the deferred is complete, so
						// set response to the result of the rendering.
						deferred.then(function (renderer) {
							response = data ? can.view.renderTo(format, renderer, data, helpers, nodelist) : renderer;
						});
					}
				}

				return response;
			}
		},

		/**
		 * @hide
		 * Registers a view with `cached` object.  This is used
		 * internally by this class and Mustache to hookup views.
		 * @param  {String} id
		 * @param  {String} text
		 * @param  {String} type
		 * @param  {can.Deferred} def
		 */
		registerView: function (id, text, type, def) {
			// Get the renderer function.
			var info = (typeof type === "object" ? type :  $view.types[type || $view.ext]),
				renderer;
			if(info.fragRenderer) {
				renderer = info.fragRenderer(id, text);
			} else {
				renderer = makeRenderer( info.renderer(id, text) );
			}

			def = def || new can.Deferred();

			// Cache if we are caching.
			if ($view.cache) {
				$view.cached[id] = def;
				def.__view_id = id;
				$view.cachedRenderers[id] = renderer;
			}

			// Return the objects for the response's `dataTypes`
			// (in this case view).
			return def.resolve(renderer);
		},

		// Returns a function that automatically converts all computes passed to it
		simpleHelper: function(fn) {
			return function() {
				var realArgs = [];
				can.each(arguments, function(val, i) {
					if (i <= arguments.length) {
						while (val && val.isComputed) {
							val = val();
						}
						realArgs.push(val);
					}
				});
				return fn.apply(this, realArgs);
			};
		}
	});

	// _removed if not used as a steal module_

	//!steal-remove-start
	if ( typeof window !== "undefined" && window.steal && steal.type) {
		//when being used as a steal module, add a new type for 'view' that runs
		// `can.view.preloadStringRenderer` with the loaded string/text for the dependency.
		steal.type("view js", function (options, success, error) {
			var type = $view.types["." + options.type],
				id = $view.toId(options.id);
			/**
			 * @hide
			 * should return something like steal("dependencies",function(EJS){
			 * return can.view.preload("ID", options.text)
			 * })
			 */
			var dependency = type.plugin || 'can/view/' + options.type,
				preload = type.fragRenderer ? "preload" : "preloadStringRenderer";
			options.text = 'steal(\'can/view\',\'' + dependency + '\',function(can){return ' + 'can.view.'+preload+'(\'' + id + '\',' + options.text + ');\n})';
			success();
		});
	}
	//!steal-remove-end

	return can;
});
