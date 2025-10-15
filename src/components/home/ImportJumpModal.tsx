// components/home/ImportJumpModal.tsx

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Group,
  Text,
  Stack,
  Stepper,
  NumberInput,
  Textarea,
  Alert,
  Paper,
  rem,
  LoadingOverlay,
  Badge,
  Select,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import {
  IconUpload,
  IconX,
  IconFile,
  IconCheck,
  IconAlertCircle,
  IconHash,
  IconCalendar,
  IconFileDescription,
  IconMapPin,
  IconUser,
} from '@tabler/icons-react';

interface ImportJumpModalProps {
  opened: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface FileInfo {
  hash: string;
  fileName: string;
  fileSize: number;
  suggestedJumpNumber: number;
  startDate: string | null;
  startLocation: {
    lat_deg: number;
    lon_deg: number;
    alt_m: number;
  } | null;
  targetUserId: string;
  targetUserName: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  nextJumpNumber: number;
}

const LAST_TARGET_USER_KEY = 'tempo-last-import-target-user';

export function ImportJumpModal({ opened, onClose, onImportComplete }: ImportJumpModalProps) {
  const [active, setActive] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // User selection (admin only)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // File info from upload
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  
  // Form fields for confirmation
  const [jumpNumber, setJumpNumber] = useState<number | undefined>();
  const [notes, setNotes] = useState('');

  // Load current user and check if admin
  useEffect(() => {
    if (opened) {
      loadCurrentUser();
    }
  }, [opened]);

  // Load users list if admin
  useEffect(() => {
    if (isAdmin && opened) {
      loadUsers();
    }
  }, [isAdmin, opened]);

  const loadCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) throw new Error('Failed to load user');
      
      const data = await response.json();
      const user = data.user;
      setCurrentUser(user);
      
      const adminStatus = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
      setIsAdmin(adminStatus);
      
      if (adminStatus) {
        // Try to load last selected user from localStorage
        const lastUserId = localStorage.getItem(LAST_TARGET_USER_KEY);
        if (lastUserId) {
          setSelectedUserId(lastUserId);
        } else {
          // Default to current admin user
          setSelectedUserId(user.id);
        }
      } else {
        // Regular users always import for themselves
        setSelectedUserId(user.id);
      }
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/users?excludeProxies=true&limit=100');
      if (!response.ok) throw new Error('Failed to load users');
      
      const data = await response.json();
      setUsers(data.users);
    } catch (error) {
      console.error('Error loading users:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load users list',
        color: 'red',
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleFileSelect = (files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      setError(null);
      setAlreadyExists(false);
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedUserId) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetUserId', selectedUserId);

      const response = await fetch('/api/jumps/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const data = await response.json();
      
      if (data.alreadyExists) {
        setAlreadyExists(true);
        notifications.show({
          title: 'Duplicate File',
          message: 'This jump log already exists for this user',
          color: 'blue',
        });
        return;
      }

      setFileInfo(data.fileInfo);
      setJumpNumber(data.fileInfo.suggestedJumpNumber);
      
      // Move to next step
      setActive(1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed');
      notifications.show({
        title: 'Upload Error',
        message: error instanceof Error ? error.message : 'Failed to upload file',
        color: 'red',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFinish = async () => {
    if (!fileInfo || !selectedUserId) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/jumps/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hash: fileInfo.hash,
          jumpNumber: jumpNumber || undefined,
          notes: notes || null,
          targetUserId: selectedUserId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save jump');
      }

      const data = await response.json();

      notifications.show({
        title: 'Success',
        message: data.message || 'Jump imported successfully. Processing will begin shortly.',
        color: 'green',
        icon: <IconCheck />,
      });

      // Save selected user to localStorage for next time (admins only)
      if (isAdmin) {
        localStorage.setItem(LAST_TARGET_USER_KEY, selectedUserId);
      }

      // Reset and close
      handleClose();
      onImportComplete();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Save failed');
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to save jump',
        color: 'red',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    // Reset all state
    setActive(0);
    setFile(null);
    setFileInfo(null);
    setJumpNumber(undefined);
    setNotes('');
    setError(null);
    setAlreadyExists(false);
    // Don't reset selectedUserId - keep it for next import
    onClose();
  };

  const nextStep = () => setActive((current) => (current < 1 ? current + 1 : current));
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  const formatFileSize = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const getUserSelectData = () => {
    return users.map(user => ({
      value: user.id,
      label: `${user.name} (${user.email})`,
    }));
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Import a Jump Log"
      size="lg"
      closeOnClickOutside={false}
    >
      <LoadingOverlay visible={uploading || processing} />
      
      <Stepper active={active} onStepClick={setActive}>
        <Stepper.Step label="Select User & Upload" description="Choose target user and file">
          <Stack mt="xl">
            {error && (
              <Alert icon={<IconAlertCircle />} color="red" variant="light">
                {error}
              </Alert>
            )}

            {alreadyExists && (
              <Alert icon={<IconAlertCircle />} color="blue" variant="light">
                This jump log already exists for this user. Please select a different file.
              </Alert>
            )}

            {/* User Selection - Admin Only */}
            {isAdmin && (
              <Select
                label="Import for User"
                description="Select the user this jump log belongs to"
                placeholder="Select a user..."
                data={getUserSelectData()}
                value={selectedUserId}
                onChange={setSelectedUserId}
                searchable
                leftSection={<IconUser size={16} />}
                disabled={loadingUsers}
                required
              />
            )}

            {/* File Upload */}
            {!file ? (
              <Dropzone
                onDrop={handleFileSelect}
                onReject={(files) => setError('Invalid file type')}
                maxSize={16 * 1024 * 1024} // 16MB
                accept={['application/octet-stream', 'text/plain']}
                disabled={!selectedUserId}
              >
                <Group justify="center" gap="xl" style={{ minHeight: rem(220), pointerEvents: 'none' }}>
                  <Dropzone.Accept>
                    <IconUpload
                      style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-green-6)' }}
                      stroke={1.5}
                    />
                  </Dropzone.Accept>
                  <Dropzone.Reject>
                    <IconX
                      style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-red-6)' }}
                      stroke={1.5}
                    />
                  </Dropzone.Reject>
                  <Dropzone.Idle>
                    <IconUpload
                      style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-dimmed)' }}
                      stroke={1.5}
                    />
                  </Dropzone.Idle>

                  <div>
                    <Text size="xl" inline>
                      Drag a log file here or click to select
                    </Text>
                    <Text size="sm" color="dimmed" inline mt={7}>
                      Attach a Tempo jump log file (.txt, or .log), max size 16MB
                    </Text>
                    {!selectedUserId && (
                      <Text size="sm" color="red" inline mt={7}>
                        Please select a user first
                      </Text>
                    )}
                  </div>
                </Group>
              </Dropzone>
            ) : (
              <Paper p="md" withBorder>
                <Group>
                  <IconFile size={32} />
                  <div style={{ flex: 1 }}>
                    <Text size="sm" fw={500}>{file.name}</Text>
                    <Text size="xs" color="dimmed">
                      {formatFileSize(file.size)}
                    </Text>
                  </div>
                  <Button
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => {
                      setFile(null);
                      setAlreadyExists(false);
                    }}
                  >
                    Remove
                  </Button>
                </Group>
              </Paper>
            )}
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Confirm Details" description="Review and save">
          <Stack mt="xl">
            {fileInfo && (
              <>
                {/* Target User Info - Admin Only */}
                {isAdmin && (
                  <Alert icon={<IconUser />} color="blue" variant="light">
                    Importing jump for: <strong>{fileInfo.targetUserName}</strong>
                  </Alert>
                )}

                {/* File Information */}
                <Paper p="md" withBorder>
                  <Text size="sm" fw={600} mb="sm">File Information</Text>
                  <Stack gap="xs">
                    <Group gap="xs">
                      <IconFileDescription size={16} />
                      <Text size="sm">Name: {fileInfo.fileName}</Text>
                    </Group>
                    <Group gap="xs">
                      <IconHash size={16} />
                      <Text size="sm">Size: {formatFileSize(fileInfo.fileSize)}</Text>
                    </Group>
                    {fileInfo.startDate && (
                      <Group gap="xs">
                        <IconCalendar size={16} />
                        <Text size="sm">
                          Jump Date: {new Date(fileInfo.startDate).toLocaleString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                          })}
                        </Text>
                      </Group>
                    )}
                    {fileInfo.startLocation && (
                      <Group gap="xs">
                        <IconMapPin size={16} />
                        <Text size="sm">
                          Location: {fileInfo.startLocation.lat_deg.toFixed(5)}°, {fileInfo.startLocation.lon_deg.toFixed(5)}°
                        </Text>
                      </Group>
                    )}
                    <Badge size="sm" color="blue" variant="light">
                      Hash: {fileInfo.hash.substring(0, 16)}...
                    </Badge>
                  </Stack>
                </Paper>

                <Stack>
                  <Alert icon={<IconAlertCircle />} color="blue" variant="light">
                    {fileInfo.startDate ? (
                      <>
                        Look at the date and time shown above. If this doesn&apos;t match the jump 
                        you wish to import, you can go back and select a different file.
                      </>
                    ) : (
                      <>
                        Jump date/time could not be determined from the file. 
                        Please ensure this is the correct jump file before proceeding.
                      </>
                    )}
                  </Alert>

                  <NumberInput
                    label="Jump Number"
                    description="From logbook (optional - will auto-increment if left blank)"
                    placeholder={`Suggested: ${fileInfo.suggestedJumpNumber}`}
                    value={jumpNumber}
                    onChange={(val) => {
                      const num = typeof val === 'number' && !isNaN(val) ? val : undefined;
                      setJumpNumber(num);
                    }}
                    min={1}
                  />

                  <Textarea
                    label="Notes"
                    description="Any notes about this jump (optional)"
                    placeholder="Enter notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.currentTarget.value)}
                    minRows={3}
                    maxRows={6}
                    maxLength={5000}
                  />
                </Stack>

                <Alert icon={<IconAlertCircle />} color="blue" variant="light" mt="md">
                  After import, the jump will be automatically analyzed. Exit time, freefall time, 
                  and other metrics will appear once processing is complete.
                </Alert>
              </>
            )}
          </Stack>
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between" mt="xl">
        <Button variant="subtle" onClick={handleClose}>
          Cancel
        </Button>
        <Group>
          {active > 0 && (
            <Button variant="default" onClick={prevStep}>
              Back
            </Button>
          )}
          {active === 0 && (
            <Button
              onClick={handleUpload}
              disabled={!file || !selectedUserId || uploading || alreadyExists}
              loading={uploading}
            >
              Next
            </Button>
          )}
          {active === 1 && (
            <Button
              onClick={handleFinish}
              disabled={!fileInfo || processing}
              loading={processing}
            >
              Import Jump
            </Button>
          )}
        </Group>
      </Group>
    </Modal>
  );
}