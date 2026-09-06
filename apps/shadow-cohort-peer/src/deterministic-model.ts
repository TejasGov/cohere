import {
  Model,
  ModelContentBlockDeltaEvent,
  ModelContentBlockStartEvent,
  ModelContentBlockStopEvent,
  ModelMessageStartEvent,
  ModelMessageStopEvent,
  type BaseModelConfig,
  type Message,
  type ModelStreamEvent
} from '@strands-agents/sdk';
import { StudentAgent } from '@shadow-cohort/agent';
import { handlePeerMessage } from './handlers';

function latestUserText(messages: Message[]): string {
  const message = [...messages].reverse().find((candidate) => candidate.role === 'user');
  if (!message) throw new Error('A2A request did not contain a user message.');
  return message.content.filter((block) => block.type === 'textBlock').map((block) => block.text).join('');
}

/** A deterministic Strands Model adapter: A2A transport is real; bid math remains Phase 1 code. */
export class PeerProtocolModel extends Model<BaseModelConfig> {
  private config: BaseModelConfig = { modelId: 'shadow-cohort-deterministic-peer' };

  constructor(private readonly studentAgent: StudentAgent) { super(); }

  updateConfig(modelConfig: BaseModelConfig): void { this.config = { ...this.config, ...modelConfig }; }
  getConfig(): BaseModelConfig { return { ...this.config }; }

  async *stream(messages: Message[]): AsyncIterable<ModelStreamEvent> {
    const response = handlePeerMessage(this.studentAgent, latestUserText(messages));
    yield new ModelMessageStartEvent({ type: 'modelMessageStartEvent', role: 'assistant' });
    yield new ModelContentBlockStartEvent({ type: 'modelContentBlockStartEvent' });
    yield new ModelContentBlockDeltaEvent({ type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: response } });
    yield new ModelContentBlockStopEvent({ type: 'modelContentBlockStopEvent' });
    yield new ModelMessageStopEvent({ type: 'modelMessageStopEvent', stopReason: 'end_turn' });
  }
}
