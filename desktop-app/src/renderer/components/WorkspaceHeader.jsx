import {
  CircleCheck,
  Ban,
  PanelRightOpen,
  PanelRightClose,
  RotateCcw,
} from 'lucide-react';

function statusPill(value, goodText = 'Ready', badText = 'Pending') {
  if (value) return <span className="status-pill good">{goodText}</span>;
  return <span className="status-pill">{badText}</span>;
}

export function WorkspaceHeader({
  title,
  description,
  promptingReady,
  blenderReady,
  serverRunning,
  ragReady,
  nodeReady,
  serverBusy,
  refreshBusy,
  isNarrowViewport,
  sidebarDrawerOpen,
  onToggleSidebar,
  onStartServer,
  onRefreshWorkspace,
}) {
  return (
    <header className="app-header workspace-header">
      <div className="workspace-header-copy">
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="workspace-status-items">
        <button
          className="ghost"
          disabled={!nodeReady || Boolean(serverRunning) || Boolean(serverBusy)}
          onClick={onStartServer}
        >
          {serverRunning ? 'Server running' : 'Start MCP server'}
        </button>
        {isNarrowViewport && (
          <button
            className="ghost"
            onClick={onToggleSidebar}
          >
            {sidebarDrawerOpen ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
        )}
        <button
          className="ghost"
          onClick={onRefreshWorkspace}
          disabled={Boolean(refreshBusy)}
        >
          <RotateCcw size={16} />
        </button>
        </div>
      </div>
      <div className="workspace-header-actions">
        <div className="workspace-status-strip" aria-label="Workspace status">
          <div className="workspace-status-item">
            <span>Prompting</span>
            {statusPill(promptingReady, <CircleCheck size={14}/>, <Ban size={14}/>)}
          </div>
          <div className="workspace-status-item">
            <span>Blender</span>
            {statusPill(blenderReady, <CircleCheck size={14}/>, <Ban size={14}/>)}
          </div>
          <div className="workspace-status-item">
            <span>Server</span>
            {statusPill(serverRunning, <CircleCheck size={14}/>, <Ban size={14}/>)}
          </div>
          <div className="workspace-status-item">
            <span>RAG</span>
            {statusPill(ragReady, <CircleCheck size={14}/>, <Ban size={14}/>)}
          </div>
        </div>
        
      </div>
    </header>
  );
}
