import type { AgentDefinitionInput } from '@cangze/contracts';

export interface AgentTemplate {
  key: string;
  definition: (t: (k: string) => string) => AgentDefinitionInput;
}

const READ_TOOLS = [
  'ha_overview',
  'ha_search_entities',
  'ha_get_states',
  'ha_history',
  'ha_logbook',
  'memory_list',
  'memory_write',
];

export const TEMPLATES: AgentTemplate[] = [
  {
    key: 'blank',
    definition: (t) => ({
      name: t('agents.templates.blank.name'),
      instructions: t('agents.templates.blank.instructions'),
      tools: READ_TOOLS,
    }),
  },
  {
    key: 'nightWatch',
    definition: (t) => ({
      name: t('agents.templates.nightWatch.name'),
      description: t('agents.templates.nightWatch.description'),
      instructions: t('agents.templates.nightWatch.instructions'),
      tools: READ_TOOLS,
      permissions: [
        {
          id: 'read-security',
          access: 'read',
          targets: { domains: ['lock', 'binary_sensor', 'cover', 'alarm_control_panel'] },
        },
      ],
      triggers: [{ id: 'nightly', kind: 'cron', name: '23:00', expression: '0 23 * * *' }],
    }),
  },
  {
    key: 'energyReport',
    definition: (t) => ({
      name: t('agents.templates.energyReport.name'),
      description: t('agents.templates.energyReport.description'),
      instructions: t('agents.templates.energyReport.instructions'),
      tools: [...READ_TOOLS, 'ha_statistics'],
      permissions: [{ id: 'read-sensors', access: 'read', targets: { domains: ['sensor'] } }],
      triggers: [{ id: 'daily', kind: 'cron', name: '21:00', expression: '0 21 * * *' }],
    }),
  },
  {
    key: 'awayCheck',
    definition: (t) => ({
      name: t('agents.templates.awayCheck.name'),
      description: t('agents.templates.awayCheck.description'),
      instructions: t('agents.templates.awayCheck.instructions'),
      tools: [...READ_TOOLS, 'ha_call_service'],
      permissions: [
        {
          id: 'read-presence',
          access: 'read',
          targets: { domains: ['person', 'device_tracker', 'binary_sensor'] },
        },
        {
          id: 'lights-off',
          access: 'control',
          targets: { domains: ['light', 'switch'] },
          services: ['turn_off'],
        },
      ],
      highRisk: 'deny',
      triggers: [],
    }),
  },
];
