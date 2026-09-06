import { CoordinatorAgent } from './coordinator';
import { renderBoard } from './board';
import { campusMarketplaceProject, defaultPeers } from './project';

console.log('SHADOW COHORT\nMulti-Agent Project Negotiation\n');
const result = await new CoordinatorAgent(defaultPeers).negotiate(campusMarketplaceProject);
console.log(`A2A peers: ${result.connectedPeers.length}/${defaultPeers.length} connected`);
for (const peer of result.connectedPeers) console.log(`● ${peer.displayName}\n  connected via A2A`);
console.log(`\nProject: ${campusMarketplaceProject.title}\nTasks: ${campusMarketplaceProject.tasks.length}\n\nA2A EVENT LOG`);
for (const event of result.events) console.log(`${event.at.slice(11, 19)} ${event.message}`);
console.log('\nBID ROUND');
for (const task of campusMarketplaceProject.tasks) {
  console.log(`\n${task.title}`);
  for (const record of result.bidsByTask[task.id] ?? []) console.log(`${record.peer.displayName}: skill ${record.bid.skillFit}, capacity ${record.bid.capacityFit}, overall ${record.bid.overallFit}, willing ${record.bid.willing ? 'yes' : 'no'}`);
}
console.log('\nPROPOSED TEAM PLAN');
console.log(JSON.stringify(result.plan, null, 2));
console.log(`\n${renderBoard(campusMarketplaceProject, result.plan, result.connectedPeers)}`);
console.log('\n[PROPOSED — HUMAN APPROVAL REQUIRED]');
