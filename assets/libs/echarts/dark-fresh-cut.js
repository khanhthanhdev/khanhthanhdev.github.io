/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
!function(e,o){"function"==typeof define&&define.amd?define(["exports","echarts"],o):"object"==typeof exports&&"string"!=typeof exports.nodeName?o(exports,require("echarts/lib/echarts")):o({},e.echarts)}(this,function(e,o){var l=function(){"undefined"!=typeof console&&console&&console.error};if(o){var r="#eee",t=function(){return{axisLine:{lineStyle:{color:r}},axisTick:{lineStyle:{color:r}},axisLabel:{color:r},splitLine:{lineStyle:{type:"dashed",color:"#aaa"}},splitArea:{areaStyle:{color:r}}}},i=["#00a8c6","#40c0cb","#ebd3ad","#aee239","#8fbe00","#33e0ff","#b3f4ff","#e6ff99"],c={color:i,backgroundColor:"#333",tooltip:{axisPointer:{lineStyle:{color:r},crossStyle:{color:r}}},legend:{textStyle:{color:r}},title:{textStyle:{color:r}},toolbox:{iconStyle:{borderColor:r}},dataZoom:{dataBackgroundColor:"#eee",fillerColor:"rgba(200,200,200,0.2)",handleColor:"#00a8c6"},timeline:{itemStyle:{color:i[1]},lineStyle:{color:r},controlStyle:{color:r,borderColor:r},label:{color:r}},timeAxis:t(),logAxis:t(),valueAxis:t(),categoryAxis:t(),line:{symbol:"circle"},graph:{color:i},gauge:{axisLine:{lineStyle:{color:[[.2,"#40c0cb"],[.8,"#00a8c6"],[1,"#8fbe00"]],width:8}}}};c.categoryAxis.splitLine.show=!1,o.registerTheme("dark-fresh-cut",c)}else l("ECharts is not Loaded")});