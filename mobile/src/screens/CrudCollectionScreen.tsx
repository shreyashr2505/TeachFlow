import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { Body, Button, Card, Divider, EmptyBox, Input, PressCard, Row, Screen, ScrollContent, SectionTitle, SpaceBetween, Tiny, Title } from '../components/ui';
import { colors, radius, spacing } from '../theme';

export type CrudField = {
  key: string;
  label: string;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  multiline?: boolean;
};

export type CrudItem = Record<string, unknown> & { id: string };

export type CrudCollectionScreenProps<T extends CrudItem> = {
  title: string;
  subtitle: string;
  data: T[];
  isOffline?: boolean;
  fields: CrudField[];
  initialValue: Record<string, string>;
  renderSummary: (item: T) => React.ReactNode;
  onCreate: (payload: Record<string, string>) => Promise<void>;
  onUpdate: (id: string, payload: Record<string, string>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh?: () => void;
  onExtraAction?: (item: T) => Promise<void> | void;
  extraActionLabel?: string;
  emptyTitle: string;
  emptyDescription: string;
};

const FloatingButton = styled(Pressable)`
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  align-items: center;
  justify-content: center;
  background-color: ${colors.accent};
  ${() => ({ shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 } as const)}
`;

const ModalSheet = styled.View`
  margin-top: auto;
  background-color: ${colors.surface};
  border-top-left-radius: 28px;
  border-top-right-radius: 28px;
  padding: ${spacing.md}px;
  border-width: 1px;
  border-color: ${colors.border};
`;

const Label = styled.Text`
  color: ${colors.textMuted};
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
  text-transform: uppercase;
`;

export function CrudCollectionScreen<T extends CrudItem>({
  title,
  subtitle,
  data,
  isOffline,
  fields,
  initialValue,
  renderSummary,
  onCreate,
  onUpdate,
  onDelete,
  onRefresh,
  onExtraAction,
  extraActionLabel = 'Action',
  emptyTitle,
  emptyDescription,
}: CrudCollectionScreenProps<T>) {
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, string>>(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data;
    return data.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  }, [data, search]);

  const openCreate = () => {
    setSelectedItem(null);
    setForm(initialValue);
    setIsOpen(true);
  };

  const openEdit = (item: T) => {
    setSelectedItem(item);
    const next: Record<string, string> = {};
    fields.forEach((field) => {
      next[field.key] = String(item[field.key] ?? '');
    });
    setForm({ ...initialValue, ...next });
    setIsOpen(true);
  };

  const closeModal = () => {
    setSelectedItem(null);
    setForm(initialValue);
    setIsOpen(false);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      if (selectedItem) {
        await onUpdate(selectedItem.id, form);
      } else {
        await onCreate(form);
      }
      closeModal();
      onRefresh?.();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollContent>
        <SpaceBetween style={{ marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Title>{title}</Title>
            <Body style={{ marginTop: 8 }}>{subtitle}</Body>
            {isOffline ? <Tiny style={{ marginTop: 6, color: '#fbbf24' }}>Offline cache active</Tiny> : null}
          </View>
          {onRefresh ? (
            <Pressable onPress={onRefresh} style={{ padding: 12 }}>
              <Feather name="refresh-cw" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </SpaceBetween>

        <Card style={{ marginBottom: spacing.md }}>
          <Label>Search</Label>
          <Input value={search} onChangeText={setSearch} placeholder="Search records" placeholderTextColor="#6b7280" />
        </Card>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <EmptyBox>
              <SectionTitle>{emptyTitle}</SectionTitle>
              <Body style={{ textAlign: 'center', marginTop: 8 }}>{emptyDescription}</Body>
            </EmptyBox>
          }
          renderItem={({ item }) => (
            <PressCard onPress={() => openEdit(item)}>
              <Card>
                <SpaceBetween style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>{renderSummary(item)}</View>
                  <View style={{ gap: 8 }}>
                    {onExtraAction ? (
                      <Pressable onPress={() => void onExtraAction(item)} style={{ padding: 8 }}>
                        <Feather name="zap" size={18} color={colors.accent} />
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => void onDelete(item.id)}
                      style={{
                        padding: 8,
                        borderRadius: 999,
                        backgroundColor: 'rgba(239,68,68,0.1)',
                      }}
                    >
                      <Feather name="trash-2" size={16} color="#fca5a5" />
                    </Pressable>
                  </View>
                </SpaceBetween>
              </Card>
            </PressCard>
          )}
        />
      </ScrollContent>

      <FloatingButton onPress={openCreate}>
        <Feather name="plus" size={24} color="#fff" />
      </FloatingButton>

      <Modal visible={isOpen} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={closeModal} />
          <ModalSheet>
            <SpaceBetween style={{ marginBottom: spacing.md }}>
              <SectionTitle>{selectedItem ? `Edit ${title}` : `New ${title}`}</SectionTitle>
              <Pressable onPress={closeModal}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </Pressable>
            </SpaceBetween>

            {fields.map((field) => (
              <View key={field.key} style={{ marginBottom: 12 }}>
                <Label>{field.label}</Label>
                <Input
                  value={form[field.key] ?? ''}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
                  placeholder={field.placeholder ?? field.label}
                  placeholderTextColor="#6b7280"
                  keyboardType={field.keyboardType ?? 'default'}
                  multiline={field.multiline}
                  style={field.multiline ? { minHeight: 100, textAlignVertical: 'top' } : undefined}
                />
              </View>
            ))}

            <Row style={{ gap: 12, marginTop: 8 }}>
              <Button variant="secondary" label="Cancel" onPress={closeModal} />
              <Button variant="primary" label={isSaving ? 'Saving...' : 'Save'} loading={isSaving} onPress={() => void save()} />
            </Row>
          </ModalSheet>
        </View>
      </Modal>
    </Screen>
  );
}
