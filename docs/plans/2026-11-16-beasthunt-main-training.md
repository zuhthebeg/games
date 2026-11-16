# Beast Hunt Main Monsters and Practice Implementation Plan
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
**Goal:** DeliverapprovedMixamomainbossesplusoptional2-3minGobkitpracticewithoutrealrewards/progressionwrites.
**Architecture:** ExistingHunt/Simhandlesrealcombat; actoradapterselectsGLBbybossid. Explicitlocalpracticecontrollerownsclonedstateandresults, nevernormalreward/roompath. Parentreviewsentirecoupledunitafterimplementertask, thenfreshspecandindependentsim/netqualityreviewbeforerelease.
**Tech Stack:** ExistingTHREE/GLTFLoader/AnimationMixer,ESmodules,Node--test,no newdependencies.

### Task1: Freezebaselineandassetadapters
Files: beasthunt/js/models.js;newbeasthunt/js/monster-motion.js orminimalexistingadapterextension;beasthunt/assets/monsters/;beasthunt/test/monster-runtime.test.mjs.
1.Run node --test beasthunt/test/*.test.mjs saveactualbaselineoutsideGit. Recordprotectedmain3files+lockSHAandcurrentHEAD.
2.WriteREDtests bossid->actualasset, lazyselectedonlyload, correctper-rigclones, cancellation/retry/dispose/reentry, attackstatetime13clip mapping, noWarrokregression. ActualGLBparseandskinposechecks notmetadata-onlyassertions.
3.Implementgenericactoradapter+Maw/Mutant/Pumpkinhulk, optionalOrc/Bloodiron, preserveoriginalart. No rawFBX/secrets/tempartifacts.
4.Runnewtests+existingmotiontests andcommit scopedassets/renderadapter.

### Task2: Alignmainphysicalcontract
Files: beasthunt/js/data.js,sim.js,game.js,main.js,i18n.js; beasthunt/js/net/protocol.js/readers ONLYifnecessary; beasthunt/test/monster-geometry.test.mjs.
1.REDmeasurevisualhitbox/rootalignmentoldtails/body,mainnonbreakmatsreachable,andstablequestids/save/HP/rewardbudgetcontracts. InspectactualrollLoot indata.js toavoidmakingforge-tailmaterials unobtainable.
2.Alignbipedgeometryandattackoriginswithactualmodel,disableunsupportedpartbreakeffects/UIfornewbosses,nofakequadrupedtailhitclaims. PreserveWarrok/hunterposes+3weapons, all8quests/currentstocks. Rename3localeUIlabelsnotIDs. Anynecessarylootcompatibilitycorrectionmustbemimimalandexplicitreviewfinding, notunapprovedeconomyboost.
3.Ifsimulationcontractchanges,bumpcanonicalwireversionandupdateeveryconsumerincludingreadonlysoundobservers+fixtures. Retainoldwire rejectiontests, doNOTweakenvalidators. No serverdeploybyworker.
4.Runrealcollider/timeline/determinism/protocol/normalquestprogressiontests; commitwithnarrowdiffrationale.

### Task3: Optionaltrainingisolatedfrommainprogression
Files: newbeasthunt/js/training.js; minimalmain.js/game.js/sim.js hooks;beasthunt/index.html/css/game.css/i18n.js;beasthunt/test/training*.test.mjs.
1.REDactualentry+skip/retry/finish/fail+pause/loadrace scenarios. Assertbefore/afterfullsavedstatebytes+localStorage/wallet/roomwrites0, no clears/besttimes/material/gold/shardschanges; trainingcan'tbeacceptedbyco-opnormalplan ornormalsettlement.
2.Implementtraininglifecycleowner, clonerealgearweaponforlocalcontrolsbutneverpassrealmutableSaveintoSim. Optionalhubentrywithclearseparatearena/projectionvisualusing1-2eligibleGobkitactors. Stagesmove/dodge,attack/heavyappropriatecurrentweapon,shortmockhunt. Showoneconciseinstructionatime(3langs),skip+restart, no newpermanentflag. Allcancelpathsdisposeactors/audio/timers/inputcleanly.
3.Bindingexample invariant: ontrainingEndcallbackmustverifycurrenthunt===itscapturedowner androuteONLYtrainingUI; doNOTtrustres.quest.idorres.training forsettlementisolation. MainonHuntEndneverappliespracticeoutput. Preventroomresume/joinsfromtrainingandback-to-hubhandoffwithoutimplicitcoop.
4.Newtests+mainUI/runtimeerrorreentrysmoke. Commitcoherentfeature.

### Task4: Completecandidategatesandhandoff
1.Runfull node --test beasthunt/test/*.test.mjs plus existingcadence/equivalence/protocoltestsneeded. Comparebasefailnamesexact; nooraclesweakened,newgenuinegeometryexpectationsjustifyseparately.
2.Checkcachequeryclosureimportmap+directtransitiveruntimeimports/indexentry/data/assets actualnewsource, nobarecachednewmodule. Parentwillfinalstampafterreview; reportcachechangesexplicitly.
3.Reporttmp/beasthunt-main-training-result.md first#PASS/#BLOCKED stageonly withcommits,files,actualtestcounts,geometry/mats/flags/wire/UIprivacyproof,clip/load/groundobservations,remainingnative/physicalphonelimits. No push/deploy/spawn/install/config/reset/stash/lockdelete. ParentfreshspecreviewthenindependentSolcode/sim/securityreview,repairfindings,retest,publishordinaryURLexactbytes+interaction. Do notclaimfullcompletionuntilparentverifiedlive.
