import React, { useEffect, useRef, useState } from 'react';
import { Note, GraphNode, GraphLink } from '../types';

interface GraphViewProps {
  notes: Note[];
  activeNoteId: string | null;
  onNodeClick: (noteId: string) => void;
}

const GraphView: React.FC<GraphViewProps> = ({ notes, activeNoteId, onNodeClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Physics constants
  const REPULSION = 1500;
  const SPRING_LENGTH = 150;
  const SPRING_STRENGTH = 0.05;
  const DAMPING = 0.85;
  const CENTER_FORCE = 0.005;

  // Initialize Graph Data
  useEffect(() => {
    // 1. Create Nodes
    // Preserve positions if nodes already exist to avoid "popping" reset,
    // otherwise randomize.
    const currentNodes = nodesRef.current;
    
    const newNodes: GraphNode[] = notes.map((note) => {
      const existing = currentNodes.find((n) => n.id === note.id);
      return {
        id: note.id,
        title: note.title,
        x: existing ? existing.x : Math.random() * (dimensions.width || 800),
        y: existing ? existing.y : Math.random() * (dimensions.height || 600),
        vx: existing ? existing.vx : 0,
        vy: existing ? existing.vy : 0,
      };
    });

    // 2. Create Links based on WikiLinks
    const newLinks: GraphLink[] = [];
    notes.forEach((sourceNote) => {
      // Regex to find [[Title]]
      const regex = /\[\[(.*?)\]\]/g;
      let match;
      while ((match = regex.exec(sourceNote.content)) !== null) {
        const targetTitle = match[1];
        const targetNote = notes.find((n) => n.title.toLowerCase() === targetTitle.toLowerCase());
        if (targetNote && targetNote.id !== sourceNote.id) {
          newLinks.push({ source: sourceNote.id, target: targetNote.id });
        }
      }
    });

    nodesRef.current = newNodes;
    linksRef.current = newLinks;
  }, [notes, dimensions]);

  // Handle Resize using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Animation Loop
  const animate = () => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const width = dimensions.width;
    const height = dimensions.height;

    if (!ctx || !width || !height) return;

    // --- Physics Step ---
    nodes.forEach((node) => {
      let fx = 0;
      let fy = 0;

      // 1. Repulsion (Node vs Node)
      nodes.forEach((other) => {
        if (node.id === other.id) return;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      });

      // 2. Attraction (Springs along Links)
      links.forEach((link) => {
        const isSource = link.source === node.id;
        const isTarget = link.target === node.id;
        
        if (isSource || isTarget) {
          const otherId = isSource ? link.target : link.source;
          const other = nodes.find((n) => n.id === otherId);
          if (other) {
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }
        }
      });

      // 3. Center Gravity (Keep nodes on screen)
      const cx = width / 2;
      const cy = height / 2;
      fx += (cx - node.x) * CENTER_FORCE;
      fy += (cy - node.y) * CENTER_FORCE;

      // Apply Velocity
      node.vx = (node.vx + fx) * DAMPING;
      node.vy = (node.vy + fy) * DAMPING;
      node.x += node.vx;
      node.y += node.vy;

      // Wall collision (soft bounce)
      if (node.x < 50) node.vx += 1;
      if (node.x > width - 50) node.vx -= 1;
      if (node.y < 50) node.vy += 1;
      if (node.y > height - 50) node.vy -= 1;
    });

    // --- Draw Step ---
    ctx.clearRect(0, 0, width, height);
    
    // Draw Links
    ctx.lineWidth = 1;
    links.forEach((link) => {
      const source = nodes.find((n) => n.id === link.source);
      const target = nodes.find((n) => n.id === link.target);
      if (source && target) {
        ctx.beginPath();
        ctx.strokeStyle = '#27272a'; // Zinc-800
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    });

    // Draw Nodes
    nodes.forEach((node) => {
      const isActive = node.id === activeNoteId;
      
      // Node Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, isActive ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#fafafa' : '#52525b'; // White if active, Zinc-600 otherwise
      ctx.fill();
      
      // Node Text
      ctx.font = `12px -apple-system, sans-serif`;
      ctx.fillStyle = isActive ? '#fafafa' : '#71717a'; // Zinc-50 or Zinc-500
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.title.substring(0, 15) + (node.title.length > 15 ? '...' : ''), node.x, node.y + 12);
    });

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [dimensions, activeNoteId]);

  // Handle Clicks
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find clicked node (simple distance check)
    const clickedNode = nodesRef.current.find((node) => {
      const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      return dist < 20; // Hit radius
    });

    if (clickedNode) {
      onNodeClick(clickedNode.id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hoveredNode = nodesRef.current.find((node) => {
      const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      return dist < 20; // Hit radius
    });
    
    // Change cursor to indicate clickability
    canvasRef.current.style.cursor = hoveredNode ? 'pointer' : '';
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-[#09090b] overflow-hidden cursor-crosshair">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
      />
      <div className="absolute bottom-6 right-6 bg-[#18181b]/80 p-2 rounded text-xs text-zinc-500 pointer-events-none border border-[#27272a] backdrop-blur-sm">
        {notes.length} Nodes • {linksRef.current.length} Connections
      </div>
    </div>
  );
};

export default GraphView;