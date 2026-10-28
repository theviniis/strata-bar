import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Choice } from '@/settings/widget-inspector'
import type { NetworkConfig } from '@/services/system/network.generated'
const networkDefaults: NetworkConfig = {
  unit: 'bytes',
  probesEnabled: true,
  probeTarget: '1.1.1.1'
}
export function NetworkSettings({
  value = networkDefaults,
  onChange
}: {
  value?: NetworkConfig
  onChange(value: NetworkConfig): void
}) {
  return (
    <FieldGroup>
      <p className="text-body text-muted-foreground">
        A interface monitorada acompanha automaticamente a rota padrão do
        Windows.
      </p>
      <Choice
        label="Unidade de tráfego"
        value={value.unit}
        options={[
          { value: 'bytes', label: 'Bytes/s · MB/s' },
          { value: 'bits', label: 'Bits/s · Mbps' }
        ]}
        onChange={(unit) => {
          if (unit === 'bytes' || unit === 'bits') onChange({ ...value, unit })
        }}
      />
      <Field orientation="horizontal">
        <FieldLabel htmlFor="network-probes">
          Sondagens contínuas ICMP
        </FieldLabel>
        <Switch
          id="network-probes"
          checked={value.probesEnabled}
          onCheckedChange={(probesEnabled) =>
            onChange({ ...value, probesEnabled })
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="network-target">Destino ICMP</FieldLabel>
        <Input
          id="network-target"
          value={value.probeTarget}
          onChange={(event) =>
            onChange({ ...value, probeTarget: event.target.value })
          }
        />
        <FieldDescription>
          IPv4 ou IPv6 literal. Uma sondagem a cada 2 s; estatísticas dos
          últimos 2 minutos.
        </FieldDescription>
      </Field>
    </FieldGroup>
  )
}
