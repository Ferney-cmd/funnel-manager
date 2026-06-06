"use client";

import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ConnectionLineType,
  ConnectionMode,
  MarkerType,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "reactflow";
import "reactflow/dist/style.css";

import { FunnelNode } from "./FunnelNode";
import { FunnelEdge } from "./FunnelEdge";
import { ZoneNode }   from "./ZoneNode";
import { ROLE_COLORS } from "@/lib/constants";
import type { FunnelNodeData } from "@/lib/types";

const nodeTypes = { funnelNode: FunnelNode, zoneNode: ZoneNode };
const edgeTypes = { funnelEdge: FunnelEdge };

const defaultEdgeOptions = {
  type: "funnelEdge",
  markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#9CA3AF" },
};

interface FunnelCanvasProps {
  nodes:         Node[];
  edges:         Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect:     (connection: Connection) => void;
  onNodeDragStop?: (event: React.MouseEvent, node: Node) => void;
  visible?:      boolean;
}

export function FunnelCanvas({
  nodes, edges,
  onNodesChange, onEdgesChange, onConnect, onNodeDragStop,
  visible = true,
}: FunnelCanvasProps) {
  return (
    <div className="canvas-area" style={{ display: visible ? "flex" : "none" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ stroke: "#9CA3AF", strokeWidth: 1.5 }}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--canvas-bg)" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={0.8}
          color="var(--dot-color)"
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n: Node) =>
            ROLE_COLORS[(n.data as FunnelNodeData)?.role] ?? "#7C3AED"
          }
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
    </div>
  );
}
