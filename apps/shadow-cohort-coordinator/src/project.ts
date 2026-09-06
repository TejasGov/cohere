import type { GroupProject } from '@shadow-cohort/core';

export const campusMarketplaceProject: GroupProject = {
  id: 'campus-marketplace', title: 'Campus Marketplace', description: 'A fictional marketplace for a university community.', deadline: '2026-10-15T23:59:00.000Z',
  tasks: [
    { id: 'backend-api', title: 'Backend API', description: 'Build REST endpoints for project data.', requiredSkills: ['Python', 'FastAPI'], estimatedHours: 8, priority: 'high', dependencies: [] },
    { id: 'frontend-ui', title: 'Frontend UI', description: 'Build the accessible marketplace interface.', requiredSkills: ['React', 'TypeScript'], estimatedHours: 8, priority: 'high', dependencies: [] },
    { id: 'database-schema', title: 'Database Schema', description: 'Design the marketplace relational schema.', requiredSkills: ['SQL', 'Database Design'], estimatedHours: 4, priority: 'medium', dependencies: ['backend-api'] },
    { id: 'recommendation-model', title: 'Recommendation Model', description: 'Build a simple product recommendation model.', requiredSkills: ['ML', 'Python'], estimatedHours: 6, priority: 'high', dependencies: ['database-schema'] },
    { id: 'integration-testing', title: 'Integration Testing', description: 'Test end-to-end application workflows.', requiredSkills: ['Testing', 'Full Stack'], estimatedHours: 5, priority: 'medium', dependencies: ['backend-api', 'frontend-ui'] },
    { id: 'presentation', title: 'Presentation', description: 'Prepare and deliver the project presentation.', requiredSkills: ['Communication', 'Presentation'], estimatedHours: 3, priority: 'medium', dependencies: [] }
  ]
};

export const defaultPeers = [
  { studentId: 'student-a', displayName: 'Student A', endpoint: 'http://127.0.0.1:9101' },
  { studentId: 'student-b', displayName: 'Student B', endpoint: 'http://127.0.0.1:9102' },
  { studentId: 'student-c', displayName: 'Student C', endpoint: 'http://127.0.0.1:9103' }
];
