import type { AcademicState } from '@academic/core';
import { StudentAgent } from '@shadow-cohort/agent';
import { validateCapacityChangeNotice, type CapacityChangeNotice, type StudentProfile } from '@shadow-cohort/core';

/** Private mutable state owned by one peer process. No AcademicState leaves this boundary. */
export class PeerRuntime {
  private academicState: AcademicState;

  constructor(readonly profile: StudentProfile, initialState: AcademicState, private readonly now: Date, private readonly overloadState?: AcademicState) {
    this.academicState = initialState;
  }

  createStudentAgent(): StudentAgent { return new StudentAgent(this.profile, this.academicState, this.now); }

  simulateAcademicOverload(): CapacityChangeNotice {
    if (!this.overloadState) throw new Error('This peer has no sanitized overload scenario.');
    const previousCapacity = this.createStudentAgent().getCapacity().availableProjectHours;
    this.academicState = this.overloadState;
    const capacity = this.createStudentAgent().getCapacity();
    const notice: CapacityChangeNotice = {
      studentId: this.profile.id,
      previousCapacity,
      newCapacity: capacity.availableProjectHours,
      capacityLevel: capacity.capacity,
      highLevelConstraint: 'academic workload increased'
    };
    if (!validateCapacityChangeNotice(notice)) throw new Error('Refusing to emit an unsafe capacity-change notice.');
    return notice;
  }
}
