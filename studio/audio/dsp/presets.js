(function(root){
"use strict";
const presets={
 natural:{id:"natural",label:"Natural",gateThresholdDb:-58,highpassHz:75,lowMidCutDb:-2,presenceBoostDb:1.5,airShelfDb:1,deEsserThresholdDb:-24,stereoWidth:.25,compThresholdDb:-18,compRatio:2.5,makeupGainDb:1},
 crisp_voice:{id:"crisp_voice",label:"Crisp Voice",gateThresholdDb:-52,highpassHz:95,lowMidCutDb:-4,presenceBoostDb:4,airShelfDb:2.5,deEsserThresholdDb:-27,stereoWidth:.15,compThresholdDb:-22,compRatio:3.5,makeupGainDb:2},
 warm:{id:"warm",label:"Warm",gateThresholdDb:-60,highpassHz:65,lowMidCutDb:-1.5,presenceBoostDb:.5,airShelfDb:-1.5,deEsserThresholdDb:-23,stereoWidth:.35,compThresholdDb:-20,compRatio:3,makeupGainDb:1},
 thump:{id:"thump",label:"Thump",gateThresholdDb:-54,highpassHz:45,lowMidCutDb:-3,presenceBoostDb:2,airShelfDb:2,deEsserThresholdDb:-26,stereoWidth:.5,compThresholdDb:-24,compRatio:4,makeupGainDb:2}
};
const defaults=Object.freeze({enabled:false,preset:"natural",enhanceAmount:.75,normalizeLufs:true});
root.StudioCleanPresets=Object.freeze(presets);
root.StudioCleanDefaults=defaults;
})(window);
