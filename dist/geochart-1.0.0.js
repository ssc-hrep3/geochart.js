var geochartjs = geochartjs || {};
geochartjs.utils = ( function($) {

	"use strict";

	return {
		formatNumber: function(x) {
			// source: http://stackoverflow.com/a/2901298
			var parts = x.toString().split(".");
			parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
			return parts.join(".");
		},
		retrieveGetArgumentsFromUrl: function() {
			var args = window.location.search.substr(1);
			var argsSplited = args.split("&");
			var object = {};
			for(var i=0; i<argsSplited.length; i++) {
				var temparray = argsSplited[i].split("=");
				if(temparray[0] !== "undefined" && temparray[0] !== null) {
					object[temparray[0]] = temparray[1];
				}
			}
			return object;
		}
	};

}(jQuery));

geochartjs.errorHandling = function(jsonResult, successCallback) {

	/* Error Handling
	 *
	 * You can execute the error handling with the following call
	 * in a module: kraken.errorHandling(returnedDataObject, callbackFunction);
	 * Pass the returned data object from the ajax call to this function
	 * If you need to execute some code after a successful error handling,
	 * you can wrap this code into a callback function and also pass it here.
	 *
	 */"use strict";

	if(typeof jsonResult !== "undefined" && jsonResult !== null) {
		if(jsonResult.hasOwnProperty("error")) {
			if(jsonResult.error.hasOwnProperty("title") && jsonResult.error.hasOwnProperty("message")) {
				showError(jsonResult.error.title, jsonResult.error.message);
			}
			else {
				showStandardMessage();
			}
		}
		else {
			if(typeof successCallback !== "undefined") {
				successCallback();
			}
		}
	}
	else {
		showNoDataMessage();
	}

	function showNoDataMessage() {
		var title = "No data received";
		var message = "While trying to get the data from the database, an error occured and no data was transferred to the webpage. Please reload this page again.";
		showError(title, message);
	}

	function showStandardMessage() {
		var title = "Error occured";
		var message = "An error occured during execution. Please reload this page.";
		showError(title, message);
	}

	function showError(title, message) {
		var $globalError = $("#globalError");
		$globalError.find(".title").text(title);
		$globalError.find(".message").text(message);
		$globalError.fadeIn("fast");
	}

};
geochartjs.map = ( function($, d3, topojson, moment, utils, errorHandling) {

	"use strict";

	var styles = {
		selectedColor: "#FFE700",
		selectedStrokeColor: "#000000",
		strokeColor: "#CCC",
		strokeWidthMin: "0.07",
		strokeWidthMax: "0.3",
		colorRangeStart: "rgb(182,218,195)",
		colorRangeEnd: "rgb(7,84,37)",
		colorNoData: "#efefef",
		mapListColorNotLocatable: "#CCC"
	};

	var properties = {
		container: ".geochart-map",
		zoomRange: [1, 9],
		mapName: "ne_50m_admin_0_countries",
		hasDataClass: "hasData",
		fullscreenClass: "fullscreen",
		notLocatableTitle: "Not Locatable",
		thresholdToSmallMap: 600,
		smallMapClass: "smallMap"
	};

	var urlParameters = {
		infoHash: null,
		date: null
	};

	var mapList = [];
	var dataTypes = [{
		'data-type': 'OBSERVED_PEERS',
		'data-type-title': 'Observed Peers',
		'active': 'active'
	}, {
		'data-type': 'MAX_SWARM_SIZE',
		'data-type-title': 'Max Swarm Size',
		'active': ''
	}, {
		'data-type': 'MAX_SWARM_SIZE2',
		'data-type-title': 'Max Swarm Size2',
		'active': ''
	}, {
		'data-type': 'MAX_SWARM_SIZE3',
		'data-type-title': 'Max Swarm Size3',
		'active': ''
	}, {
		'data-type': 'MAX_SWARM_SIZE4',
		'data-type-title': 'Max Swarm Size4',
		'active': ''
	}, {
		'data-type': 'MAX_SWARM_SIZE5',
		'data-type-title': 'Max Swarm Size5',
		'active': ''
	}, {
		'data-type': 'MAX_SWARM_SIZE6',
		'data-type-title': 'Max Swarm Size6',
		'active': ''
	}, {
		'data-type': 'MAX_SWARM_SIZE7',
		'data-type-title': 'Max Swarm Size7',
		'active': ''
	}];

	var colorRange = d3.scale.linear()
		.range([0,1]);
	var strokeRange = d3.scale.linear()
		.domain(properties.zoomRange)
		.range([styles.strokeWidthMax, styles.strokeWidthMin]);
	var svg;
	var group;
	var width;
	var height;
	var projection;
	var path;
	var dataObservedPeersMaximum = 0;
	var zoom;
	var topo;
	var valueMappingFunction = Math.log;
	var mapJsonUrl;
	var dataJsonUrl;
	var csvMapPath;
	var mapIsHidden = false;
	var resizeTimer;
	var fixedSize = false;
	var windowWidth;
	var tabScrollApi;
	var $scrollTabElement;

	var valueMappingFunctions = {
		log: function(n) {
			return Math.log(n);
		},
		linear: function(n) {
			return n;
		},
		quadratic: function(n) {
			return Math.pow(n, 2);
		},
		sqrt: function(n) {
			return Math.sqrt(n);
		},
		cubicroot: function(n) {
			return Math.pow(n, 1/3);
		},
		neginverse: function(n) {
			return -1/n + 1;
		}
	};

	function initializeWithoutControls(mapJsonUrlNew, dataJsonUrlNew, csvMapPathNew) {
		$(properties.container).addClass("noControls");
		initialize(mapJsonUrlNew, dataJsonUrlNew, csvMapPathNew);
	}

	function initializeHidden(mapJsonUrlNew, dataJsonUrlNew, csvMapPathNew) {
		mapIsHidden = true;
		initialize(mapJsonUrlNew, dataJsonUrlNew, csvMapPathNew);
	}

	function initialize(mapJsonUrlNew, dataJsonUrlNew, csvMapPathNew) {
		mapJsonUrl = mapJsonUrlNew;
		dataJsonUrl = dataJsonUrlNew;
		csvMapPath = csvMapPathNew;

		setUrlParameters(utils.retrieveGetArgumentsFromUrl());
		$(properties.container + " .slide-menu a.csvDownload").attr("href", createCsvUrl());

		setupMap();
		makeMapResizable();
		if(mapIsHidden) {
			$(properties.container).hide();
		}
		else {
			d3.json(mapJsonUrl, function(mapJson) {
				errorHandling(mapJson, function() {
					topo = topojson.feature(mapJson, mapJson.objects[properties.mapName]);

					d3.json(createDataUrl(), function(dataJson) {
						errorHandling(dataJson, function() {
							setDataObservedPeersMaximum(dataJson);
							setColorRangeDomain();
							topo = mergeData(topo, dataJson);
							fillMapListWithData();
							fillDateStampWithData(dataJson.DATE);
							addScrollingToList();
							displayMap();
							displayFunctionSelectButton();
							fillDataTypeSelectButtonWithEntries();
						});
					});
				});
			});
		}

		addClickListenerToZoomButtons();
		addClickListenerToFullScreenButtons();
		addClickListenerToListButtons();
		addClickListenerToSettingsButton();
		addChangeListenerToFunctionSelect();
		addChangeListenerToDataTypeSelectBox();
		addInfoHashChangeListener();
		addDateChangeListener();
	}

	function fillDateStampWithData(date) {
		$(properties.container + " .slide-menu h2 .date").text("("+date+")");
	}

	function fillMapListWithData() {
		var $mapList = $(properties.container + " .slide-menu .list table tbody");
		$mapList.empty();
		$mapList.loadTemplate($("#slide-menu-table-template"), mapList);
		$('.data-type-chooser .scroll-pane').loadTemplate($("#data-type-chooser-template"), dataTypes).find('span').addClass('tab');

		addScrollingToTabs();
		addClickListenerToDataTypeTabButtons();
	}

	function adaptMapToNewUrlParameters() {
		$(properties.container).slideUp("fast");
		$(properties.container + " .slide-menu a.csvDownload").attr("href", createCsvUrl());
		svg.remove();
		$(properties.container + " .single-country-info").fadeOut();
		var mapRefresh = true;
		setupMap(mapRefresh);

		d3.json(mapJsonUrl, function(mapJson) {
			errorHandling(mapJson, function() {
				topo = topojson.feature(mapJson, mapJson.objects[properties.mapName]);

				d3.json(createDataUrl(), function(error, dataJson) {
					errorHandling(dataJson, function() {
						setDataObservedPeersMaximum(dataJson);
						setColorRangeDomain();
						topo = mergeData(topo, dataJson);
						fillMapListWithData();
						fillDateStampWithData(dataJson.DATE);
						addScrollingToList();
						displayMap();
						displayFunctionSelectButton();
						$(properties.container).slideDown("slow");
						$("html,body").animate({scrollTop: $(properties.container).offset().top}, "slow");
					});
				});
			});
		});
	}

	function setUrlParameters(parameters) {
		if(typeof parameters !== "undefined") {
			if(typeof parameters.date !== "undefined") {
				urlParameters.date = parameters.date;
			}
			if(typeof parameters.infoHash !== "undefined") {
				urlParameters.infoHash = parameters.infoHash;
			}
		}
	}

	function createDataUrl() {
		var url = dataJsonUrl;
		if(urlParameters.date !== null) {
			url += "?date=" + urlParameters.date;
			if(urlParameters.infoHash !== null) {
				url += "&infoHash=" + urlParameters.infoHash;
			}
		}
		else if(urlParameters.infoHash !== null) {
			url += "?infoHash=" + urlParameters.infoHash;
		}
		return url;
	}

	function createCsvUrl() {
		var url = csvMapPath;
		if(urlParameters.date !== null) {
			url += "?date=" + urlParameters.date;
			if(urlParameters.infoHash !== null) {
				url += "&infoHash=" + urlParameters.infoHash;
			}
		}
		else if(urlParameters.infoHash !== null) {
			url += "?infoHash=" + urlParameters.infoHash;
		}
		return url;
	}

	function setupMap(mapRefresh) {
		svg = d3.select(properties.container).append("svg");
		projection = d3.geo.equirectangular();

		var showMapInitiallyAfterHide = typeof mapRefresh !== "undefined" && mapRefresh && mapIsHidden;
		if(showMapInitiallyAfterHide) {
			mapIsHidden = false;
		}

		if(helper.isInFullscreen()) {
			if(!showMapInitiallyAfterHide) {
				height = $(properties.container).height();
				width = height * 2;
			}
			svg.attr({width: $(properties.container).width(), height: $(properties.container).height()});
			projection.translate([(width/2), (height/2)]).scale(width/2/Math.PI);
		}
		else {
			if(!showMapInitiallyAfterHide) {
				width = $(properties.container).width();
				height = width / 2;
			}
			svg.attr({width: width, height: height});
			projection.translate([(width/2), (height/2)]).scale(width/2/Math.PI);
		}

		$(properties.container).removeClass(properties.smallMapClass);
		if(width < properties.thresholdToSmallMap) {
			$(properties.container).addClass(properties.smallMapClass);
		}

		path = d3.geo.path().projection(projection);
		zoom = d3.behavior.zoom().scaleExtent(properties.zoomRange).on("zoom", move);

		group = svg.append("g").style("opacity", 0);
		svg.call(zoom).call(zoom.event).on("click", preventClickingWhileDragging, true);

		windowWidth = $(window).width();
	}

	function preventClickingWhileDragging() {
		// example from http://bl.ocks.org/mbostock/9656675
		if (d3.event.defaultPrevented) d3.event.stopPropagation();
	}

	function makeMapResizable() {
		d3.select(window).on("resize", function() {
			var isFullscreen = $(properties.container).is("."+properties.fullscreenClass);
			var windowWidthChanged = windowWidth !== $(window).width();

			if(!mapIsHidden && !(fixedSize && !isFullscreen) && (isFullscreen || windowWidthChanged)) {
				windowWidth = $(window).width();
				window.clearTimeout(resizeTimer);
				d3.select(properties.container + " .overlay").transition().duration(200).style("opacity", 0);
				$(properties.container + " .single-country-info").hide();
				resizeTimer = window.setTimeout(function() {
					redraw();
					$("html,body").animate({scrollTop: $(properties.container).offset().top}, "fast");
				}, 300);
			}
		});
	}

	function redraw() {
		svg.remove();
		setupMap();
		selectCountryOnMapList(undefined);
		displayMap();
	}

	function setColorRangeDomain(dataJson) {
		colorRange.domain([0, valueMappingFunction(dataObservedPeersMaximum)]);
	}

	function setDataObservedPeersMaximum(dataJson) {
		dataObservedPeersMaximum = d3.max(dataJson.COUNTRIES, function(datum) {
			return parseInt(datum.OBSERVED_PEERS, 10);
		});
	}

	function mergeData(topo, dataJson) {
		mapList = [];

		for(var i=0; i<dataJson.COUNTRIES.length; i++) {
			var codeMatch = false;
			var dataCountryCode = dataJson.COUNTRIES[i].COUNTRY_CODE;
			var dataObservedPeers = parseInt(dataJson.COUNTRIES[i].OBSERVED_PEERS, 10);
			var dataMaxSwarmSize = parseInt(dataJson.COUNTRIES[i].MAX_SWARM_SIZE, 10);
			var dataPercentage = parseFloat(dataJson.COUNTRIES[i].PERCENTAGE);

			for(var j=0; j < topo.features.length; j++) {
				var mapCountryCode = topo.features[j].properties.iso_a2;
				if(dataCountryCode === mapCountryCode) {
					topo.features[j].properties.observedPeers = dataObservedPeers;
					topo.features[j].properties.maxSwarmSize = dataMaxSwarmSize;
					topo.features[j].properties.percentage = dataPercentage;
					codeMatch = true;
					mapList.push({
						ranking: i+1,
						observedPeers: dataObservedPeers,
						maxSwarmSize: dataMaxSwarmSize,
						percentage: dataPercentage,
						countryName: topo.features[j].properties.name,
						countryCode: dataCountryCode,
						continent: topo.features[j].properties.continent
					});
				}
			}
			if(!codeMatch) {
				mapList.push({
					ranking: i+1,
					observedPeers: dataObservedPeers,
					maxSwarmSize: dataMaxSwarmSize,
					percentage: dataPercentage,
					countryName: dataCountryCode,
					countryCode: dataCountryCode,
					continent: undefined
				});
			}
		}

		var notLocatablePeers = parseInt(dataJson.NOT_LOCATABLE_PEERS, 10);
		var notLocatablePercentage = parseFloat(dataJson.NOT_LOCATABLE_PERCENTAGE);
		if(notLocatablePeers > 0) {
			mapList.push({
				ranking: "&nbsp;",
				observedPeers: notLocatablePeers,
				maxSwarmSize: "&ndash;",
				percentage: notLocatablePercentage,
				countryName: properties.notLocatableTitle,
				countryCode: properties.notLocatableTitle,
				continent: undefined
			});
		}

		for(var k=0; k < mapList.length; k++) {
			if(mapList[k].countryName === properties.notLocatableTitle) {
				mapList[k].color = styles.mapListColorNotLocatable;
			}
			else {
				mapList[k].color = helper.getColor({properties: {observedPeers: mapList[k].observedPeers}});
			}
		}

		return topo;
	}

	function displayMap() {
		group.selectAll("path")
		.data(topo.features)
		.enter()
		.append("path")
		.attr("d", path)
		.style("fill", addBackgroundColor)
		.style("stroke-width", styles.strokeWidthMax+"px")
		.style("stroke", addStrokeColor)
		.style("cursor", setPointerCursor)
		.on("click", clickHandler);

		moveNoDataPathStrokesToTheBackground();
		group.transition().duration(700).style("opacity", 1);
		d3.select(properties.container + " .overlay").transition().duration(700).style("opacity", 1);
	}

	function moveNoDataPathStrokesToTheBackground() {
		group.selectAll("path").each(function(datum) {
			if(!helper.hasPeerData(datum)) {
				var parent = $(this).parent()[0];
				var firstChildOfParent = $(parent).children().first()[0];
				parent.insertBefore(this, firstChildOfParent);
			}
		});
	}

	function setPointerCursor(datum) {
		if(helper.hasPeerData(datum)) {
			return "pointer";
		}
	}

	function addBackgroundColor(datum) {
		if(helper.hasPeerData(datum)) {
			return helper.getColor(datum);
		}
		else {
			return styles.colorNoData;
		}
	}

	function addStrokeColor(datum) {
		if(helper.hasPeerData(datum)) {
			return helper.getStrokeColor(datum);
		}
		else {
			return styles.strokeColor;
		}
	}

	function clickHandler(datum) {
		/*jshint validthis:true */
		var selectedColorString = d3.rgb(styles.selectedColor).toString();
		var currentColorString = d3.rgb(d3.select(this).style("fill")).toString();
		var isAlreadySelected = selectedColorString === currentColorString;

		if(helper.hasPeerData(datum) && !isAlreadySelected) {
			group.selectAll("path").style("fill", addBackgroundColor).style("stroke", addStrokeColor);
			d3.select(this.parentNode.appendChild(this)).transition().style({
				"fill": styles.selectedColor,
				"stroke": styles.selectedStrokeColor
			});
			addAndShowSingleCountryInfo(datum);
			selectCountryOnMapList(datum);
		}
	}

	function addAndShowSingleCountryInfo(datum) {
		$('.single-country-info').fadeIn();
		$('.single-country-info').loadTemplate($("#single-country-info-template"), datum.properties);
	}

	function selectCountryOnMapList(datum) {
		var $list = $(properties.container + " .mapList .list");
		var $row = $list.find("table tbody tr");
		$row.removeClass("selected");

		if(typeof datum !== "undefined") {
			var countryCode = datum.properties.iso_a2;

			$row.each(function() {
				if($(this).data("country-code") === countryCode) {
					$(this).addClass("selected");
				}
			});
		}
	}

	function move() {
		if(d3.event.scale < 1) {
			d3.event.scale = 1;
		}
		var translate = d3.event.translate;
		var scale = d3.event.scale;

		translate = stopTranslateOnViewportBorders(translate, scale);
		adaptZoomButtonDisableColor(scale);

		group.selectAll("path").style("stroke-width", strokeRange(scale)+"px");
		group.attr("transform", "translate(" + translate + ")scale(" + scale + ")");
	}

	function displayFunctionSelectButton() {
		$(properties.container + " .functionSelect").fadeIn();
	}

	function addClickListenerToZoomButtons() {
		$(properties.container + " .zoom-plus").click(function() {
			zoomMap.apply(this, [{zoomIn: true}]);
		});
		$(properties.container + " .zoom-minus").click(function() {
			zoomMap.apply(this, [{zoomIn: false}]);
		});

		function zoomMap(object) {
			/*jshint validthis:true */
			var activatedButton = !$(this).hasClass("inactive");
			var objectIsValid = object.zoomIn === true || object.zoomIn === false;

			if(activatedButton && objectIsValid) {
				var scaleBefore = zoom.scale();
				var translateBefore = zoom.translate();
				var centerBefore = [(translateBefore[0] - (width/2)), (translateBefore[1] - (height/2))];
				var scale = object.zoomIn ? Math.round(scaleBefore + 1) : Math.round(scaleBefore - 1);
				var center = [(centerBefore[0] / scaleBefore) * scale, (centerBefore[1] / scaleBefore) * scale];
				var translate = [center[0] + (width/2), center[1] + (height/2)];

				translate = stopTranslateOnViewportBorders(translate, scale);

				if(scale >= properties.zoomRange[0] && scale <= properties.zoomRange[1]) {
					svg.transition().duration(100).call(zoom.scale(scale).translate(translate).event);
				}
				else if(scale > properties.zoomRange[1]) {
					svg.transition().duration(100).call(zoom.scale(properties.zoomRange[1]).translate(translate).event);
				}
				else {
					svg.transition().duration(100).call(zoom.scale(properties.zoomRange[0]).translate(translate).event);
				}
			}
		}
	}

	function addClickListenerToFullScreenButtons() {
		$(properties.container + " .fullscreen-open").click(function() {
			if($(this).is(":not(:hidden)")) {
				$(properties.container).addClass(properties.fullscreenClass);
				$("html").css({"overflow": "hidden"});
				$(properties.container + " .single-country-info").fadeOut();
				$(this).fadeOut();
				$(properties.container + " .fullscreen-close").fadeIn();
				makeFullscreen($(properties.container));
				redraw();
			}
		});
		$(properties.container + " .fullscreen-close").click(function() {
			if($(this).is(":not(:hidden)")) {
				exitFullscreen();
				$(properties.container).removeClass(properties.fullscreenClass);
				$("html").css({"overflow": "visible"});
				$(properties.container + " .single-country-info").fadeOut();
				$(this).fadeOut();
				$(properties.container + " .fullscreen-open").fadeIn();
				redraw();
			}
		});
	}

	function makeFullscreen($element) {
		var elem = $element[0];

		if (elem.requestFullscreen) {
			elem.requestFullscreen();
		}
		else if (elem.msRequestFullscreen) {
			elem.msRequestFullscreen();
		}
		else if (elem.mozRequestFullScreen) {
			elem.mozRequestFullScreen();
		}
		else if (elem.webkitRequestFullscreen) {
			elem.webkitRequestFullscreen();
		}
	}

	function exitFullscreen() {
		if(document.exitFullscreen) {
			document.exitFullscreen();
		}
		else if(document.mozCancelFullScreen) {
			document.mozCancelFullScreen();
		}
		else if(document.webkitExitFullscreen) {
			document.webkitExitFullscreen();
		}
	}

	function addClickListenerToListButtons() {
		var $list = $(properties.container + " .slide-menu .menu");
		var $showButton = $(properties.container + " .show-slide-menu-button");
		var $hideArea = $(properties.container + " .hide-slide-menu-area");

		$showButton.click(function() {
			$list.animate({"left": 0});
			$showButton.fadeOut();
			$hideArea.fadeIn();
			if(typeof $scrollTabElement !== 'undefined') {
				tabScrollApi.scrollToX($scrollTabElement.position().left-30);
			}
		});
		$hideArea.click(function() {
			$list.animate({"left": - ($list.outerWidth() + 20)});
			$showButton.fadeIn();
			$hideArea.fadeOut();
		});
	}

	function addChangeListenerToFunctionSelect() {
		$(properties.container + " .functionSelect").change(function() {
			valueMappingFunction = valueMappingFunctions[$(this).find("option:selected").val()];
			setColorRangeDomain();
			$(".single-country-info").hide();
			redraw();
		});
	}

	function addInfoHashChangeListener() {
		$("body").on("mapInfoHashChange", function(event, data) {
			urlParameters.infoHash = data.infoHash;
			adaptMapToNewUrlParameters();
		});
	}

	function addDateChangeListener() {
		$("body").on("mapDateChange", function(event, data) {
			if(typeof data.date === "undefined") {
				$(properties.container).slideUp("fast");
				mapIsHidden = true;
			}
			else {
				urlParameters.date = data.date;
				adaptMapToNewUrlParameters();
			}
		});
	}

	function addScrollingToList() {
		$('.list .scroll-pane').jScrollPane({ verticalDragMinHeight: 70 });
	}

	function addScrollingToTabs() {
		var $tabs = $('.data-type-chooser');
		var $scrollPane = $tabs.find('.scroll-pane');

		tabScrollApi = $scrollPane.jScrollPane({
			showArrows: true,
			animateScroll: true,
			speed: 200
		}).data('jsp');
	}


	function addClickListenerToSettingsButton() {
		$('.button.settings').click(function() {
			var $regularIcon = $(this).find('.icon-settings');
			var $hideIcon = $(this).find('.icon-settings-hide');

			if($(this).hasClass('shown')) {
				$(this).removeClass('shown');
				$(this).animate({ bottom: 10 }, "fast");
				$('.settingsWrapper').animate({ bottom: -55 }, "fast");
				$hideIcon.fadeOut("fast");
				$regularIcon.fadeIn("fast");
			}
			else {
				$(this).addClass('shown');
				$(this).animate({ bottom: 50 }, "fast");
				$('.settingsWrapper').animate({ bottom: 10 }, "fast");
				$hideIcon.fadeIn("fast");
				$regularIcon.fadeOut("fast");
			}
		});
	}

	function addChangeListenerToDataTypeSelectBox() {
		$('.button.dataTypeSelect').change(function() {
			var type = $(this).find('option:selected').val();
			selectDataType(type);
		});
	}
	function addClickListenerToDataTypeTabButtons() {
		var $tabs = $('.data-type-chooser .tab');
		$tabs.click(function() {
			var type = $(this).data('type');
			$('.button.dataTypeSelect').val(type);
			selectDataType(type);
		});
	}
	function selectDataType(type) {
		$scrollTabElement = $('.data-type-chooser .tab[data-type='+type+']');

		var $tabs = $('.data-type-chooser .tab');
		$tabs.removeClass('active');
		$tabs.filter('[data-type='+type+']').addClass('active');
	}

	function fillDataTypeSelectButtonWithEntries() {
		$('select.dataTypeSelect').loadTemplate($("#data-type-chooser-select-template"), dataTypes);
	}

	function stopTranslateOnViewportBorders(translate, scale) {
		// example on http://techslides.com/d3-map-starter-kit/
		if(helper.isInFullscreen()) {
			var borderRight = ($(properties.container).width() - width) * (scale) - $(properties.container).width() * (scale-1);
			translate[0] = Math.min(0, Math.max(borderRight, translate[0]));
		}
		else {
			translate[0] = Math.min(0, Math.max(width * (1 - scale), translate[0]));
		}
		translate[1] = Math.min(0, Math.max(height * (1 - scale), translate[1]));
		return translate;
	}

	function adaptZoomButtonDisableColor(scale) {
		var inaccuracyBuffer = 0.05;

		if(scale < properties.zoomRange[0] + inaccuracyBuffer) {
			$(properties.container + " .zoom-minus").addClass("inactive");
			$(properties.container + " .zoom-plus").removeClass("inactive");
		}
		else if(scale > properties.zoomRange[1] - inaccuracyBuffer) {
			$(properties.container + " .zoom-plus").addClass("inactive");
			$(properties.container + " .zoom-minus").removeClass("inactive");
		}
		else {
			$(properties.container + " .zoom-plus").removeClass("inactive");
			$(properties.container + " .zoom-minus").removeClass("inactive");
		}
	}

	var helper = {};
	helper.hasPeerData = (function(datum) {
		return typeof datum.properties.observedPeers !== "undefined";
	});
	helper.getPercentageBetweenUpperAndLowerColor = (function(datum) {
		var value = datum.properties.observedPeers;
		var valueMapped = valueMappingFunction(value);
		return colorRange(valueMapped);
	});
	helper.getColor = (function(datum) {
		var percentValueBetweenUpperAndLowerColor = helper.getPercentageBetweenUpperAndLowerColor(datum);
		var interpolationFunction = d3.interpolateRgb(styles.colorRangeStart, styles.colorRangeEnd);
		return interpolationFunction(percentValueBetweenUpperAndLowerColor);
	});
	helper.getStrokeColor = (function(datum) {
		return d3.rgb(helper.getColor(datum)).darker().toString();
	});
	helper.isInFullscreen = (function() {
		return $(properties.container).hasClass(properties.fullscreenClass);
	});

	function makeFixedSize() {
		fixedSize = true;
	}

	return {
		init: initialize,
		initHidden: initializeHidden,
		initWithoutControls: initializeWithoutControls,
		makeFixedSize: makeFixedSize
	};

}(jQuery, d3, topojson, moment, geochartjs.utils, geochartjs.errorHandling));