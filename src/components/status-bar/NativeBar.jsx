import { Layers3, X } from 'lucide-react'
import { Cpu } from '../../features/cpu/Cpu'
import { Memory } from '../../features/memory/Memory'
import { Clock } from '../../features/clock/Clock'
import { Volume } from '../../features/volume/Volume'
import { bridge } from '../../services/system/bridge'
import './native-bar.css'
export default function NativeBar() {
  return (
    <nav className="native-bar" aria-label="Barra de status Strata">
      <div className="bar-left">
        <span className="bar-brand">
          <Layers3 size={17} />
          <span>strata</span>
        </span>
        <span className="bar-divider" />
        <Cpu />
        <Memory />
      </div>
      <Clock />
      <div className="bar-right">
        <Volume />
        <span className="bar-divider" />
        <button
          className="bar-exit"
          aria-label="Sair do Strata"
          title="Sair do Strata em todos os monitores"
          onClick={() =>
            bridge
              .quit()
              .catch((e) => console.error('Não foi possível sair', e))
          }
        >
          <X size={13} />
        </button>
      </div>
    </nav>
  )
}
