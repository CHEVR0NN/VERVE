'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, type Connection, type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { toRFNodes, toRFEdges, fromRFNodes, fromRFEdges } from '@/lib/workflow/rf-adapter';
import { nodeTypes } from './nodes';

export function Canvas() {
  const graph = useWorkflowStore((s) => s.graph);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const selectNode = useWorkflowStore((s) => s.selectNode);

  const rfNodes = useMemo(() => toRFNodes(graph.nodes), [graph.nodes]);
  const rfEdges = useMemo(() => toRFEdges(graph.edges), [graph.edges]);

  const handleNodesChange = useCallback(
    (changes: unknown) => {
      void changes;
    },
    [],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const nextEdges = fromRFEdges([
        ...rfEdges,
        { id: `e-${connection.source}-${connection.target}-${Date.now()}`, ...connection },
      ]);
      setEdges(nextEdges);
    },
    [rfEdges, setEdges],
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => selectNode(node.id),
    [selectNode],
  );

  void handleNodesChange;
  void fromRFNodes;
  void setNodes;

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={() => selectNode(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
