/*global $:false ko:false console:false d3:false */
var HierarchicalPie = function(options) {
  var self = this;

  var config = {
    width             : 400,
    height            : 250,
    chartId           : null,
    data              : null,
    legendContainer   : null,
    hoverRadiusDiff   : 10,
    navigation        : null,
    dataSchema        : {
      idField       : 'id_category',
      valueField    : 'cost',
      childrenField : 'categories'
    },
    hoverPieAnimation : {
      easing   : "elastic",
      duration : 1000
    },
    focusAnimation : {
      easing   : "easeInOutQuart",
      duration : 100
    }
  };
  $.extend(config, config, options || {});

  this.tweenPie = function(b){
    b.innerRadius = 0;
    var i = d3.interpolate({startAngle: 0, endAngle: 0}, b);
    return function(t) { return self.arc(i(t)); };
  };

  this.tabulateCategories = function (data) {
    var table = d3.select(config.legendContainer).select('table');
    table.select('tbody').remove();
    var tbody = table.append('tbody');
    var rowTemplate = Mustache.compile($('#rowTemplate').html());
    // create a row for each object in the data
    var tableRows = tbody.selectAll("tr")
        .data(data)
        .enter()
          .append("tr")
          .attr('data_id', function(d) { return d[config.dataSchema.idField]; })
          .attr('class', function(d) { return 'legend-row-' + d[config.dataSchema.idField]; })
          .html(function(d) {
            d.color = self.color(d[config.dataSchema.idField]);
            d.isDirect = d[config.dataSchema.idField] == null;
            return rowTemplate(d);
          });

    return table;
  };

  // chart width
  self.width  = config.width;
  self.height = config.height;
  // pie radius
  self.radius = Math.min(self.width, self.height) / 2;
  self.inLevel = 1;
  //data for each level of chart, to make navigation possible
  self.dataChain = [];

  this.init = function() {
    self.palette = d3.scale.ordinal()
      .range(['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#8f7540', '#bcbd22', '#17becf', '#d7de85', '#754a5f', '#857c57', '#46a2b0', '#ff9896']);
    self.color = function(id) {
      return id === null ? '#ddd' : self.palette(id);
    };
    self.arc     = d3.svg.arc().outerRadius(self.radius - config.hoverRadiusDiff).innerRadius(self.radius / 2);
    self.arcOver = d3.svg.arc().outerRadius(self.radius).innerRadius(self.radius / 2);
    self.pie     = d3.layout.pie().sort(null).value(function(d) {
      var val = d[config.dataSchema.valueField];
      if(typeof val === 'string')
        return parseFloat(val);

      return val;
    });

    self.svg = d3.select(config.chartId).append("svg")
      .attr('id', 'chart').attr("width", self.width)
      .attr("height", self.height)
      .append("g")
        .attr("transform", "translate(" + self.radius + "," + ((self.height / 2)) + ")");

    self.focusGroup = self.svg.append('g').attr('class', 'focus-group');

    self.percentLabel = self.focusGroup.append('g')
      .attr('class', 'arc-percent').append("text");

    self.costLabel = self.focusGroup.append('g')
      .attr('class', 'arc-cost').append("text").attr("dy", "1.2em");

    self.navigation = $(config.navigation);
    self.navigation.find('#btnRoot').on('click', self.goToRoot);
    self.navigation.find('#btnLevelUp').on('click', self.goLevelUp);
  };

  this.goToRoot = function() {
    self.inLevel = 1;
    self.dataChain.length = 0; //clear chain
    self.renderCake(config.data);
    self.navigation.hide();

    return false;
  };

  this.goLevelUp = function() {
    if(self.inLevel == 2 || self.dataChain.length == 0)
      return self.goToRoot();

    self.inLevel--;
    self.dataChain.splice(self.dataChain.length - 1, 1);
    var prev = self.dataChain[self.dataChain.length - 1];
    self.renderCake(prev[config.dataSchema.childrenField]);
    if(self.inLevel == 1)
      self.navigation.hide();

    return false;
  };

  this.updateNav = function() {
    var breadcrumb = d3.select(config.navigation).select('.breadcrumb');
    breadcrumb.selectAll('li').remove();
    breadcrumb.selectAll('li')
      .data(self.dataChain)
      .enter()
        .append("li")
        .html(function(d, i) {
          return d.category + '<span class="divider">/</span>';
        });
  }

  this.pieClick = function (d, i) {
    var c = self.arc.centroid(d);
    if(typeof d.data[config.dataSchema.childrenField] === 'undefined')
      return false;

    //console.log(d.data);
    self.inLevel++;
    self.dataChain.push( d.data );

    self.focusGroup.attr('opacity', 0);
    d3.select(this).attr("d", self.arc);

    self.renderCake(d.data[config.dataSchema.childrenField]);
    if(self.inLevel > 1)
      self.navigation.show();

    return false;
  };

  this.pieMouseOut = function (d, i) {
    var hovered = d3.select(this);

    self.focusGroup.transition().attr('opacity', 0);
    hovered.transition().ease(config.focusAnimation.easing).duration(config.focusAnimation.duration).attr("d", self.arc);

    d3.select(config.legendContainer).select('.legend-row-' + d.data[config.dataSchema.idField]).selectAll('td').classed("hovered", false);
  };

  this.pieMouseOver = function (d, i) {
    var hovered = d3.select(this);

    var percentage = (((d.endAngle - d.startAngle) / (2 * Math.PI)) * 100).toFixed(1);
    self.percentLabel.text(percentage + '%');
    self.costLabel.text('$' + d.data[config.dataSchema.valueField]);
    self.focusGroup.transition().attr('opacity', 1);
    hovered.transition().ease(config.focusAnimation.easing).duration(config.focusAnimation.duration).attr("d", self.arcOver);

    d3.select(config.legendContainer).select('.legend-row-' + d.data[config.dataSchema.idField]).selectAll('td').classed("hovered", true);
  };

  this.renderCake = function(data) {
    self.updateNav();
    self.svg.select('g.cake').remove();
    var arcs = self.svg.append('g').attr('class', 'cake')
      .selectAll("g.arc").data(self.pie(data))
      .enter().append("g")
        .attr("class", "arc");

    arcs.append("path").attr("d", self.arc)
      .attr("fill", function(d) { return self.color(d.data[config.dataSchema.idField]); })
      .attr("stroke", function(d) { return d3.rgb(self.color(d.data[config.dataSchema.idField])).darker(); })
      .attr('class', function(d) { return 'category-pie-' + d.data[config.dataSchema.idField] + (typeof d.data[config.dataSchema.childrenField] === 'undefined' ? ' pie-leaf' : ''); })
      .on('mouseover', self.pieMouseOver)
      .on('mouseout', self.pieMouseOut)
      .on('click', self.pieClick)
      .transition().ease(config.hoverPieAnimation.easing).duration(config.hoverPieAnimation.duration)
      .attrTween("d", self.tweenPie);

    self.tabulateCategories(data);
  };

  self.init();
  self.renderCake(config.data);

};
