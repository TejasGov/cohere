export type DemoEvent = 'deadline' | 'cancel' | 'room' | 'assignment';

export interface DemoState {
  deadlineChanged: boolean;
  classCancelled: boolean;
  roomChanged: boolean;
  assignmentAdded: boolean;
}

export const initialState: DemoState = {
  deadlineChanged: false,
  classCancelled: false,
  roomChanged: false,
  assignmentAdded: false
};

export function updateDemoState(state: DemoState, event: DemoEvent): DemoState {
  const key: Record<DemoEvent, keyof DemoState> = {
    deadline: 'deadlineChanged', cancel: 'classCancelled', room: 'roomChanged', assignment: 'assignmentAdded'
  };
  const property = key[event];
  return { ...state, [property]: !state[property] };
}
