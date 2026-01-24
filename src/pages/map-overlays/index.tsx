// /pages/map-overlays/index.tsx
// Admin page for managing GeoJSON map overlays (SUPER_ADMIN only)

import { useState, useEffect, useRef } from 'react';
import {
  Container,
  Title,
  Table,
  Button,
  Group,
  Badge,
  ActionIcon,
  Modal,
  TextInput,
  Textarea,
  Stack,
  Switch,
  Text,
  FileInput,
  Progress,
  Paper,
  Tooltip,
  ColorInput
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconMapPin,
  IconUpload
} from '@tabler/icons-react';
import { AppLayout } from '../../components/AppLayout';
import { AuthGuard } from '../../components/AuthGuard';

interface MapOverlay {
  id: string;
  name: string;
  description: string | null;
  storagePath: string;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  featureCount: number;
  fileSize: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
  uploadedBy: {
    id: string;
    name: string;
    slug: string;
  };
}

export default function MapOverlaysPage() {
  const [overlays, setOverlays] = useState<MapOverlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOverlay, setEditingOverlay] = useState<MapOverlay | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadForm = useForm({
    initialValues: {
      name: '',
      description: ''
    },
    validate: {
      name: (value) => !value ? 'Name is required' : null
    }
  });

  const editForm = useForm({
    initialValues: {
      name: '',
      description: '',
      isVisible: true,
      fillColor: '#22cc44',
      fillOpacity: 0.15,
      strokeColor: '#22cc44',
      strokeWidth: 2
    },
    validate: {
      name: (value) => !value ? 'Name is required' : null
    }
  });

  useEffect(() => {
    loadOverlays();
  }, []);

  const loadOverlays = async () => {
    try {
      const response = await fetch('/api/map-overlays');
      if (!response.ok) throw new Error('Failed to load overlays');

      const data = await response.json();
      setOverlays(data.overlays);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load map overlays',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (values: typeof uploadForm.values) => {
    if (!selectedFile) {
      notifications.show({
        title: 'Error',
        message: 'Please select a GeoJSON file',
        color: 'red'
      });
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('name', values.name);
      formData.append('description', values.description || '');
      formData.append('file', selectedFile);

      const response = await fetch('/api/map-overlays', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload overlay');
      }

      notifications.show({
        title: 'Success',
        message: 'Overlay uploaded successfully',
        color: 'green'
      });

      setUploadModalOpen(false);
      uploadForm.reset();
      setSelectedFile(null);
      loadOverlays();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to upload overlay',
        color: 'red'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (overlay: MapOverlay) => {
    setEditingOverlay(overlay);
    editForm.setValues({
      name: overlay.name,
      description: overlay.description || '',
      isVisible: overlay.isVisible,
      fillColor: overlay.fillColor,
      fillOpacity: overlay.fillOpacity,
      strokeColor: overlay.strokeColor,
      strokeWidth: overlay.strokeWidth
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (values: typeof editForm.values) => {
    if (!editingOverlay) return;

    try {
      const response = await fetch(`/api/map-overlays/${editingOverlay.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update overlay');
      }

      notifications.show({
        title: 'Success',
        message: 'Overlay updated successfully',
        color: 'green'
      });

      setEditModalOpen(false);
      setEditingOverlay(null);
      loadOverlays();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to update overlay',
        color: 'red'
      });
    }
  };

  const handleToggleVisibility = async (overlay: MapOverlay) => {
    try {
      const response = await fetch(`/api/map-overlays/${overlay.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: !overlay.isVisible })
      });

      if (!response.ok) throw new Error('Failed to update visibility');

      loadOverlays();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update overlay visibility',
        color: 'red'
      });
    }
  };

  const handleDownload = async (overlay: MapOverlay) => {
    try {
      const response = await fetch(`/api/map-overlays/${overlay.id}?download=true`);
      if (!response.ok) throw new Error('Failed to download overlay');

      const data = await response.json();

      // Create blob and download
      const blob = new Blob([JSON.stringify(data.geojson, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${overlay.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to download overlay',
        color: 'red'
      });
    }
  };

  const handleDelete = async (overlay: MapOverlay) => {
    if (!confirm(`Delete overlay "${overlay.name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`/api/map-overlays/${overlay.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete overlay');

      notifications.show({
        title: 'Success',
        message: 'Overlay deleted',
        color: 'green'
      });

      loadOverlays();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete overlay',
        color: 'red'
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <AuthGuard requireAdmin>
      <AppLayout>
        <Container size="xl">
          <Group justify="space-between" mb="xl">
            <Title order={2}>Map Overlays</Title>
            <Button
              leftSection={<IconUpload size={16} />}
              onClick={() => {
                uploadForm.reset();
                setSelectedFile(null);
                setUploadModalOpen(true);
              }}
            >
              Upload Overlay
            </Button>
          </Group>

          {loading ? (
            <Text c="dimmed">Loading overlays...</Text>
          ) : overlays.length === 0 ? (
            <Paper withBorder p="xl" ta="center">
              <IconMapPin size={48} style={{ opacity: 0.5 }} />
              <Text size="lg" mt="md">No map overlays yet</Text>
              <Text size="sm" c="dimmed">Upload a GeoJSON file to create your first overlay</Text>
            </Paper>
          ) : (
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Features</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Uploaded</Table.Th>
                  <Table.Th>Visible</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {overlays.map((overlay) => (
                  <Table.Tr key={overlay.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 2,
                            backgroundColor: overlay.fillColor,
                            border: `2px solid ${overlay.strokeColor}`
                          }}
                        />
                        <div>
                          <Text size="sm" fw={500}>{overlay.name}</Text>
                          {overlay.description && (
                            <Text size="xs" c="dimmed">{overlay.description}</Text>
                          )}
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>{overlay.featureCount}</Table.Td>
                    <Table.Td>{formatFileSize(overlay.fileSize)}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(overlay.createdAt)}</Text>
                      <Text size="xs" c="dimmed">by {overlay.uploadedBy.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        checked={overlay.isVisible}
                        onChange={() => handleToggleVisibility(overlay)}
                        size="sm"
                      />
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Download GeoJSON">
                          <ActionIcon
                            variant="subtle"
                            onClick={() => handleDownload(overlay)}
                          >
                            <IconDownload size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Edit">
                          <ActionIcon
                            variant="subtle"
                            onClick={() => handleEdit(overlay)}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDelete(overlay)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          {/* Upload Modal */}
          <Modal
            opened={uploadModalOpen}
            onClose={() => setUploadModalOpen(false)}
            title="Upload Map Overlay"
            size="md"
          >
            <form onSubmit={uploadForm.onSubmit(handleUpload)}>
              <Stack>
                <TextInput
                  label="Name"
                  required
                  placeholder="Landing Areas"
                  {...uploadForm.getInputProps('name')}
                />
                <Textarea
                  label="Description"
                  placeholder="Optional description of the overlay"
                  {...uploadForm.getInputProps('description')}
                />
                <FileInput
                  label="GeoJSON File"
                  required
                  placeholder="Select a .geojson or .json file"
                  accept=".geojson,.json,application/json,application/geo+json"
                  value={selectedFile}
                  onChange={setSelectedFile}
                  leftSection={<IconUpload size={16} />}
                />
                {selectedFile && (
                  <Text size="xs" c="dimmed">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </Text>
                )}
                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    onClick={() => setUploadModalOpen(false)}
                    disabled={uploading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={uploading}
                    leftSection={<IconUpload size={16} />}
                  >
                    Upload
                  </Button>
                </Group>
              </Stack>
            </form>
          </Modal>

          {/* Edit Modal */}
          <Modal
            opened={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            title="Edit Map Overlay"
            size="md"
          >
            <form onSubmit={editForm.onSubmit(handleEditSubmit)}>
              <Stack>
                <TextInput
                  label="Name"
                  required
                  {...editForm.getInputProps('name')}
                />
                <Textarea
                  label="Description"
                  {...editForm.getInputProps('description')}
                />
                <Switch
                  label="Visible on map"
                  {...editForm.getInputProps('isVisible', { type: 'checkbox' })}
                />
                <Group grow>
                  <ColorInput
                    label="Fill Color"
                    {...editForm.getInputProps('fillColor')}
                  />
                  <ColorInput
                    label="Stroke Color"
                    {...editForm.getInputProps('strokeColor')}
                  />
                </Group>
                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    onClick={() => setEditModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    Save Changes
                  </Button>
                </Group>
              </Stack>
            </form>
          </Modal>
        </Container>
      </AppLayout>
    </AuthGuard>
  );
}
