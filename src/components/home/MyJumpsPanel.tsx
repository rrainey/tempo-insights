// components/home/MyJumpsPanel.tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  Card, 
  Text, 
  Badge, 
  Group, 
  Stack, 
  Skeleton, 
  ScrollArea, 
  Menu, 
  ActionIcon,
  Divider,
  Center,
  Loader
} from '@mantine/core';
import { IconClock, IconRuler, IconAlertCircle, IconDots, IconUpload } from '@tabler/icons-react';

interface Jump {
  id: string;
  jumpNumber: number | null;
  createdAt: string;
  exitTimestamp: string | null;
  deviceName: string;
  freefallTime: number | null;
  avgFallRate: number | null;
  analyzed: boolean;
  hasIssues: boolean;
  message: string | null;
  hasGPS: boolean;
  visible: boolean;
}

interface JumpGroup {
  type: 'year' | 'month';
  year: number;
  month?: number; // 0-11 for months
  count: number;
  jumps: Jump[];
}

interface MyJumpsPanelProps {
  onJumpSelect?: (jumpId: string) => void;
  onImportClick?: () => void;
}

const INITIAL_LOAD = 30;
const LOAD_MORE = 20;

export function MyJumpsPanel({ onJumpSelect, onImportClick }: MyJumpsPanelProps) {
  const [jumps, setJumps] = useState<Jump[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchJumps(true);
    
    // Poll for updates every 30 seconds
    const interval = setInterval(() => fetchJumps(true), 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchJumps = async (reset: boolean = false) => {
    const currentOffset = reset ? 0 : offset;
    const limit = reset ? INITIAL_LOAD : LOAD_MORE;
    
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const response = await fetch(`/api/jumps/list-summary?limit=${limit}&offset=${currentOffset}`);
      if (!response.ok) {
        throw new Error('Failed to fetch jumps');
      }
      
      const data = await response.json();
      
      if (reset) {
        setJumps(data.jumps);
        setOffset(data.jumps.length);
      } else {
        setJumps(prev => [...prev, ...data.jumps]);
        setOffset(prev => prev + data.jumps.length);
      }
      
      setHasMore(data.pagination.hasMore);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jumps');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleScroll = useCallback(() => {
    if (!viewport.current || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = viewport.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    // Load more when scrolled 80% down
    if (scrollPercentage > 0.8) {
      fetchJumps(false);
    }
  }, [loadingMore, hasMore, offset]);

  const groupJumpsByDate = (jumps: Jump[]): JumpGroup[] => {
    const groups: JumpGroup[] = [];
    let currentYear: number | null = null;
    let currentMonth: number | null = null;
    let yearJumps: Jump[] = [];
    let monthJumps: Jump[] = [];

    jumps.forEach((jump) => {
      // Use exitTimestamp if available, otherwise fall back to createdAt
      const dateStr = jump.exitTimestamp || jump.createdAt;
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = date.getMonth();

      // Check if we're in a new year
      if (currentYear !== null && year !== currentYear) {
        // Finish the current month group
        if (monthJumps.length > 0) {
          groups.push({
            type: 'month',
            year: currentYear,
            month: currentMonth!,
            count: monthJumps.length,
            jumps: monthJumps,
          });
        }

        // Add year group for the PREVIOUS year at the END
        groups.push({
          type: 'year',
          year: currentYear,
          count: yearJumps.length,
          jumps: [],
        });

        // Start NEW year group at the TOP
        groups.push({
          type: 'year',
          year: year,
          count: 0, // Will be calculated later
          jumps: [],
        });

        // Reset for new year
        yearJumps = [jump];
        monthJumps = [jump];
        currentYear = year;
        currentMonth = month;
      } else if (currentMonth !== null && month !== currentMonth) {
        // Finish the current month group
        if (monthJumps.length > 0) {
          groups.push({
            type: 'month',
            year: currentYear!,
            month: currentMonth,
            count: monthJumps.length,
            jumps: monthJumps,
          });
        }

        // Start new month group
        monthJumps = [jump];
        yearJumps.push(jump);
        currentMonth = month;
      } else {
        // Add to current groups
        if (currentYear === null) {
          // Very first jump - add year header at top
          currentYear = year;
          currentMonth = month;
          groups.push({
            type: 'year',
            year: year,
            count: 0, // Will be calculated later
            jumps: [],
          });
        }
        yearJumps.push(jump);
        monthJumps.push(jump);
      }
    });

    // Add the final month group
    if (monthJumps.length > 0) {
      groups.push({
        type: 'month',
        year: currentYear!,
        month: currentMonth!,
        count: monthJumps.length,
        jumps: monthJumps,
      });
    }

    // Calculate counts for year headers by counting jumps until next year header
    let currentYearCount = 0;
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].type === 'month') {
        currentYearCount += groups[i].count;
      } else if (groups[i].type === 'year') {
        groups[i].count = currentYearCount;
        currentYearCount = 0;
      }
    }

    return groups;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatFreefallTime = (seconds: number | null) => {
    if (seconds === null) return 'N/A';
    return `${Math.round(seconds)}s`;
  };

  const formatFallRate = (mph: number | null) => {
    if (mph === null) return 'N/A';
    return `${Math.round(mph)} mph`;
  };

  const getMonthName = (month: number) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month];
  };

  const renderJumpCard = (jump: Jump) => (
    <Card
      key={jump.id}
      p="sm"
      withBorder
      style={{ cursor: 'pointer' }}
      onClick={() => onJumpSelect?.(jump.id)}
    >
      <Group justify="space-between" mb="xs">
        <Text size="sm" fw={500}>
          {formatDate(jump.exitTimestamp || jump.createdAt)}
        </Text>
        <Badge size="xs" color={jump.visible ? 'green' : 'gray'}>
          {jump.visible ? 'Visible' : 'Private'}
        </Badge>
      </Group>

      <Group gap="xs" mb="xs">
        <Text size="xs" color="dimmed">{jump.deviceName}</Text>
        {jump.hasGPS && (
          <Badge size="xs" variant="dot" color="blue">GPS</Badge>
        )}
      </Group>

      {jump.analyzed ? (
        <>
          {jump.hasIssues ? (
            <Group gap="xs">
              <IconAlertCircle size={16} color="orange" />
              <Text size="sm" color="orange">{jump.message}</Text>
            </Group>
          ) : (
            <Group gap="md">
              <Group gap={4}>
                <IconClock size={16} />
                <Text size="sm">{formatFreefallTime(jump.freefallTime)}</Text>
              </Group>
              <Group gap={4}>
                <IconRuler size={16} />
                <Text size="sm">{formatFallRate(jump.avgFallRate)}</Text>
              </Group>
            </Group>
          )}
        </>
      ) : (
        <Badge size="sm" color="gray">Processing...</Badge>
      )}
    </Card>
  );

  if (loading) {
    return (
      <Card>
        <Text size="lg" fw={600} mb="md">My Recent Jumps</Text>
        <Stack gap="sm">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} height={80} radius="sm" />
          ))}
        </Stack>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Text size="lg" fw={600} mb="md">My Recent Jumps</Text>
        <Text color="red" size="sm">{error}</Text>
      </Card>
    );
  }

  const groups = groupJumpsByDate(jumps);

  return (
    <Card>
      <Group justify="space-between" mb="md">
        <Text size="lg" fw={600}>My Jumps</Text>
        <Menu withinPortal position="bottom-end" shadow="sm">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray">
              <IconDots size={20} />
            </ActionIcon>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconUpload size={16} />}
              onClick={onImportClick}
            >
              Import...
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      
      <ScrollArea 
        style={{ height: 500 }} 
        viewportRef={viewport}
        onScrollPositionChange={handleScroll}
      >
        {jumps.length === 0 ? (
          <Text color="dimmed" size="sm">No jumps recorded yet</Text>
        ) : (
          <Stack gap="md">
            {groups.map((group, groupIndex) => (
              <div key={`${group.type}-${group.year}-${group.month || 0}`}>
                {group.type === 'year' ? (
                  // Year header
                  <Divider
                    label={
                      <Group gap="xs">
                        <Text size="lg" fw={700}>{group.year}</Text>
                        <Text size="sm" c="dimmed">{group.count} jump{group.count !== 1 ? 's' : ''}</Text>
                      </Group>
                    }
                    labelPosition="center"
                    my="md"
                  />
                ) : (
                  // Month header with jumps
                  <>
                    <Group gap="xs" mb="sm" mt={groupIndex > 0 ? "md" : 0}>
                      <Text size="md" fw={600}>
                        {getMonthName(group.month!)} {group.year}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {group.count} jump{group.count !== 1 ? 's' : ''}
                      </Text>
                    </Group>
                    <Stack gap="sm">
                      {group.jumps.map(jump => renderJumpCard(jump))}
                    </Stack>
                  </>
                )}
              </div>
            ))}
            
            {/* Loading indicator for infinite scroll */}
            {loadingMore && (
              <Center py="md">
                <Loader size="sm" />
              </Center>
            )}
            
            {/* End of list indicator */}
            {!hasMore && jumps.length > 0 && (
              <Center py="md">
                <Text size="sm" c="dimmed">No more jumps to load</Text>
              </Center>
            )}
          </Stack>
        )}
      </ScrollArea>
    </Card>
  );
}