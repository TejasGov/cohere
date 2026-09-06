import type { PeerCapacitySummary, StudentCapacity, StudentCapacityLevel, StudentProfile, StudentWorkloadSummary } from './schema';

const AVAILABILITY_FACTOR = { low: 0.8, medium: 0.5, high: 0.35, critical: 0.15 } as const;

function capacityLevel(hours: number): StudentCapacityLevel {
  if (hours < 5) return 'low';
  if (hours < 10) return 'medium';
  return 'high';
}

function countReason(count: number, singular: string, plural: string): string | undefined {
  if (count === 0) return undefined;
  return `${count === 1 ? 'One' : String(count)} ${count === 1 ? singular : plural}`;
}

export function calculateStudentCapacity(profile: StudentProfile, workload: StudentWorkloadSummary): StudentCapacity {
  const availableProjectHours = Math.round(profile.weeklyAvailabilityHours * AVAILABILITY_FACTOR[workload.estimatedLoad] * 10) / 10;
  const reasons = [
    countReason(workload.upcomingExams, 'exam is scheduled within the next fourteen days.', 'exams are scheduled within the next fourteen days.'),
    countReason(workload.upcomingAssignments, 'assignment deadline is approaching.', 'assignment deadlines are approaching.'),
    workload.majorDeadlinesNext7Days > 1 ? 'Multiple major deadlines fall within the next seven days.' : undefined,
    `${profile.weeklyAvailabilityHours} weekly hours were explicitly declared before academic-pressure adjustment.`
  ].filter((reason): reason is string => reason !== undefined);
  return { availableProjectHours, capacity: capacityLevel(availableProjectHours), academicPressure: workload.estimatedLoad, reasons };
}

export function createPeerCapacitySummary(profile: StudentProfile, capacity: StudentCapacity): PeerCapacitySummary {
  const label = `${capacity.academicPressure[0]?.toUpperCase()}${capacity.academicPressure.slice(1)}`;
  return {
    studentId: profile.id,
    capacity: capacity.capacity,
    availableProjectHours: capacity.availableProjectHours,
    strongSkills: profile.skills.filter((skill) => skill.proficiency === 'advanced' || skill.proficiency === 'expert').map((skill) => skill.name),
    constraints: capacity.academicPressure === 'low' ? [] : [`${label} academic pressure limits near-term commitments.`]
  };
}
