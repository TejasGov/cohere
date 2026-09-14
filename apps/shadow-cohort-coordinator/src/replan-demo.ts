import { ShadowCoordinatorRuntime } from './runtime-service';
import { campusMarketplaceProject, defaultPeers } from './project';

function assignmentLines(plan: Awaited<ReturnType<ShadowCoordinatorRuntime['negotiate']>>['plan']): string[] {
  return plan.allocations.map((allocation) => `${allocation.taskId} → ${allocation.studentId} (${allocation.estimatedHours}h)`);
}

console.log('SHADOW COHORT\nDynamic A2A Replanning Demo\n');
const runtime = new ShadowCoordinatorRuntime(campusMarketplaceProject, defaultPeers);
const initial = await runtime.negotiate();
console.log(`Peers: ${initial.connectedPeers.length}/3 connected via Strands A2A`);
console.log(`\nPROJECT\n${campusMarketplaceProject.title}`);
console.log(`Estimated work: ${initial.feasibility.totalEstimatedProjectHours}h`);
console.log(`Safe team capacity: ${initial.feasibility.totalSafeTeamHours}h`);
console.log(`Capacity margin: ${initial.feasibility.capacityMargin}h`);
console.log(`Feasibility: ${initial.feasibility.status.toUpperCase()}`);
console.log('\nNEGOTIATING INITIAL PLAN...');
console.log(assignmentLines(initial.plan).join('\n'));
console.log(`\nPLAN V1\nAllocated: ${initial.plan.allocations.length}/${campusMarketplaceProject.tasks.length}\nStatus: ${initial.plan.status.toUpperCase()}`);

runtime.approveCurrentPlan();
console.log('\nDEMO AUTO-APPROVAL: Plan v1 approved.');
console.log('\nSIMULATING ACADEMIC WORKLOAD CHANGE...');
const replan = await runtime.simulateStudentCOverload();
const notice = replan.triggeringEvent.newValue;
if (typeof notice !== 'object' || notice === null || !('previousCapacity' in notice) || !('newCapacity' in notice)) throw new Error('Missing safe capacity-change notice.');
console.log(`Student C safe capacity: ${String(notice.previousCapacity)}h → ${String(notice.newCapacity)}h`);
console.log(`Replan status: ${replan.status.toUpperCase()}`);
console.log('\nA2A RE-NEGOTIATION');
for (const change of replan.changedAllocations) console.log(`${change.taskId}: ${change.oldStudentId} → ${change.newStudentId}`);
console.log(`Assignments changed: ${replan.changedAllocations.length}`);
console.log(`Unchanged assignments: ${replan.unchangedAllocations.length}`);
if (replan.proposedPlan) console.log(`\nPLAN V${replan.proposedPlan.version}\n${JSON.stringify(replan.proposedPlan, null, 2)}\nStatus: PROPOSED — HUMAN APPROVAL REQUIRED`);

const status = runtime.getStatus();
console.log('\nPRIVACY-SAFE EVENT LOG');
for (const event of status.eventLog) console.log(`${event.at.slice(11, 19)} ${event.message}`);
const serialized = JSON.stringify(status);
const privateMarkers = ['"courses"', '"assignments"', '"exams"', 'sourceUrl', 'private-course', 'Private upcoming work'];
console.log(`\nPrivacy: ${privateMarkers.some((marker) => serialized.includes(marker)) ? 'FAIL' : 'PASS'}`);
