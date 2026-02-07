import { SnowflakeGenerator } from '@toolkit-f/snowflake-id';

import env from '#config/env.js';

const generator = new SnowflakeGenerator({
   machineId: env.MACHINE_ID,
   clockMoveBackAction: 'wait',
});

export const generateId = (): string => generator.nextIdString();
