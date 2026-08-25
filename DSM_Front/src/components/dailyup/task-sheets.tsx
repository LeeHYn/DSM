import React, { type PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  AppButton,
  AppText,
  AppToggle,
  Badge,
  Divider,
  Icon,
  IconButton,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import {
  dailyupFonts,
  dailyupMotion,
  dailyupRadius,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import {
  type NewTaskInput,
  usePrototype,
} from '@/features/prototype/prototype-context';
import {
  type TaskCategory,
  type TaskDifficulty,
} from '@/features/prototype/prototype-data';

const CATEGORIES: TaskCategory[] = ['건강', '학업', '생활'];
const DIFFICULTIES: TaskDifficulty[] = ['낮음', '보통', '높음'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function timeToMinutes(value: string) {
  if (!TIME_PATTERN.test(value)) {
    return null;
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function BottomSheet({
  children,
  onClose,
}: PropsWithChildren<{ onClose: () => void }>) {
  const palette = useDailyupPalette();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        duration: dailyupMotion.normal,
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        duration: dailyupMotion.normal,
        toValue: 0,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.backdrop, { backgroundColor: palette.overlay, opacity }]}>
        <Pressable
          accessibilityLabel="시트 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: palette.background,
            borderColor: palette.border,
            transform: [{ translateY }],
          },
        ]}>
        <View style={[styles.handle, { backgroundColor: palette.border }]} />
        {children}
      </Animated.View>
    </View>
  );
}

function FieldLabel({ children }: PropsWithChildren) {
  return (
    <AppText style={styles.fieldLabel} variant="label">
      {children}
    </AppText>
  );
}

function FormInput({
  error,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  error?: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const palette = useDailyupPalette();
  return (
    <View style={styles.inputGroup}>
      <TextInput
        accessibilityLabel={placeholder}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          {
            backgroundColor: palette.surface,
            borderColor: error ? palette.danger : palette.border,
            color: palette.text,
          },
        ]}
        value={value}
      />
      {error ? (
        <AppText color={palette.danger} variant="caption">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

function ChoiceRow<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: T[];
  value: T;
}) {
  const palette = useDailyupPalette();
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.choice,
              {
                backgroundColor: selected ? palette.lime : palette.surface,
                borderColor: selected ? palette.lime : palette.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}>
            <AppText
              color={selected ? palette.textOnLime : palette.muted}
              style={styles.choiceText}
              variant="label">
              {option}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function NewTaskSheet() {
  const { addTask, closeNewTask, isNewTaskOpen } = usePrototype();
  const palette = useDailyupPalette();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>('보통');
  const [category, setCategory] = useState<TaskCategory>('생활');
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [errors, setErrors] = useState<{ endTime?: string; startTime?: string; title?: string }>({});

  const resetAndClose = () => {
    setTitle('');
    setDescription('');
    setStartTime('09:00');
    setEndTime('10:00');
    setDifficulty('보통');
    setCategory('생활');
    setNotificationEnabled(true);
    setErrors({});
    closeNewTask();
  };

  const submit = () => {
    const nextErrors: typeof errors = {};
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    if (!title.trim()) {
      nextErrors.title = '제목을 입력해 주세요.';
    }
    if (start === null) {
      nextErrors.startTime = '시간을 HH:MM 형식으로 입력해 주세요.';
    }
    if (end === null) {
      nextErrors.endTime = '시간을 HH:MM 형식으로 입력해 주세요.';
    } else if (start !== null && end <= start) {
      nextErrors.endTime = '종료 시간은 시작 시간보다 뒤여야 해요.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const input: NewTaskInput = {
      category,
      description: description.trim(),
      difficulty,
      endTime,
      notificationEnabled,
      startTime,
      title: title.trim(),
    };
    addTask(input);
    setTitle('');
    setDescription('');
    setErrors({});
  };

  if (!isNewTaskOpen) {
    return null;
  }

  return (
    <BottomSheet onClose={resetAndClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheetHeader}>
          <View>
            <AppText variant="sectionTitle">새 일과 추가</AppText>
            <AppText color={palette.muted} variant="caption">
              오늘 할 일을 등록해 보세요.
            </AppText>
          </View>
          <IconButton accessibilityLabel="새 일과 닫기" name="close" onPress={resetAndClose} />
        </View>
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View>
            <FieldLabel>제목</FieldLabel>
            <FormInput
              error={errors.title}
              onChangeText={setTitle}
              placeholder="일과 제목"
              value={title}
            />
          </View>
          <View>
            <FieldLabel>설명</FieldLabel>
            <FormInput
              multiline
              onChangeText={setDescription}
              placeholder="일과에 대한 설명"
              value={description}
            />
          </View>
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <FieldLabel>시작 시간</FieldLabel>
              <FormInput
                error={errors.startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                value={startTime}
              />
            </View>
            <View style={styles.timeField}>
              <FieldLabel>종료 시간</FieldLabel>
              <FormInput
                error={errors.endTime}
                onChangeText={setEndTime}
                placeholder="10:00"
                value={endTime}
              />
            </View>
          </View>
          <View>
            <FieldLabel>난이도</FieldLabel>
            <ChoiceRow onChange={setDifficulty} options={DIFFICULTIES} value={difficulty} />
          </View>
          <View>
            <FieldLabel>카테고리</FieldLabel>
            <ChoiceRow onChange={setCategory} options={CATEGORIES} value={category} />
          </View>
          <View style={[styles.toggleRow, { borderColor: palette.border }]}>
            <View style={styles.toggleCopy}>
              <AppText variant="label">완료 알림</AppText>
              <AppText color={palette.muted} variant="caption">
                종료 시간에 완료 여부를 알려드려요.
              </AppText>
            </View>
            <AppToggle
              accessibilityLabel="완료 알림"
              onValueChange={setNotificationEnabled}
              value={notificationEnabled}
            />
          </View>
          <AppButton icon="check" onPress={submit}>
            저장
          </AppButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: 'calendar-clock' | 'folder-outline' | 'signal';
  label: string;
  value: string;
}) {
  const palette = useDailyupPalette();
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIcon, { backgroundColor: palette.surfaceRaised }]}>
        <Icon color={palette.muted} name={icon} size={17} />
      </View>
      <View style={styles.detailCopy}>
        <AppText color={palette.muted} variant="caption">
          {label}
        </AppText>
        <AppText variant="label">{value}</AppText>
      </View>
    </View>
  );
}

function TaskDetailSheet() {
  const {
    closeTaskDetail,
    deleteTask,
    screenState,
    selectedTask,
    toggleTask,
  } = usePrototype();
  const palette = useDailyupPalette();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!selectedTask) {
      setConfirmDelete(false);
    }
  }, [selectedTask]);

  const statusText = useMemo(
    () => (selectedTask?.completed ? '완료됨' : '진행 전'),
    [selectedTask?.completed],
  );

  if (!selectedTask) {
    return null;
  }

  const interactionDisabled = screenState === 'offline';

  return (
    <BottomSheet onClose={closeTaskDetail}>
      <View style={styles.sheetHeader}>
        <View style={styles.detailHeading}>
          <Badge tone={selectedTask.completed ? 'lime' : 'neutral'}>{statusText}</Badge>
          <AppText variant="sectionTitle">{selectedTask.title}</AppText>
        </View>
        <IconButton accessibilityLabel="일과 상세 닫기" name="close" onPress={closeTaskDetail} />
      </View>
      <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
        <View style={styles.detailRows}>
          <DetailRow
            icon="calendar-clock"
            label="시간"
            value={`${selectedTask.startTime} - ${selectedTask.endTime}`}
          />
          <DetailRow icon="folder-outline" label="카테고리" value={selectedTask.category} />
          <DetailRow icon="signal" label="난이도" value={selectedTask.difficulty} />
        </View>
        <Divider />
        <View style={styles.description}>
          <AppText color={palette.muted} variant="caption">
            설명
          </AppText>
          <AppText>
            {selectedTask.description || '등록된 설명이 없습니다.'}
          </AppText>
        </View>
        <View style={styles.detailActions}>
          <AppButton
            disabled={interactionDisabled}
            icon={selectedTask.completed ? 'undo' : 'check'}
            onPress={() => toggleTask(selectedTask.id)}>
            {selectedTask.completed ? '완료 취소' : '완료 처리'}
          </AppButton>
          {confirmDelete ? (
            <View style={[styles.confirmBox, { borderColor: `${palette.danger}66` }]}>
              <AppText style={styles.confirmText} variant="label">
                이 일과를 삭제할까요?
              </AppText>
              <View style={styles.confirmActions}>
                <AppButton onPress={() => setConfirmDelete(false)} style={styles.confirmButton} variant="ghost">
                  취소
                </AppButton>
                <AppButton
                  disabled={interactionDisabled}
                  onPress={() => deleteTask(selectedTask.id)}
                  style={styles.confirmButton}
                  variant="danger">
                  삭제
                </AppButton>
              </View>
            </View>
          ) : (
            <AppButton
              disabled={interactionDisabled}
              icon="trash-can-outline"
              onPress={() => setConfirmDelete(true)}
              variant="danger">
              삭제
            </AppButton>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export function TaskSheets() {
  return (
    <>
      <NewTaskSheet />
      <TaskDetailSheet />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  choice: {
    alignItems: 'center',
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: dailyupSpacing.two,
    marginTop: dailyupSpacing.two,
  },
  choiceText: {
    fontFamily: dailyupFonts.bold,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: dailyupSpacing.two,
  },
  confirmBox: {
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    gap: dailyupSpacing.three,
    padding: dailyupSpacing.three,
  },
  confirmButton: {
    flex: 1,
    minHeight: 40,
  },
  confirmText: {
    textAlign: 'center',
  },
  description: {
    gap: dailyupSpacing.two,
  },
  detailActions: {
    gap: dailyupSpacing.three,
  },
  detailBody: {
    gap: dailyupSpacing.five,
    paddingBottom: dailyupSpacing.six,
    paddingHorizontal: dailyupSpacing.five,
  },
  detailCopy: {
    flex: 1,
    gap: 2,
  },
  detailHeading: {
    flex: 1,
    gap: dailyupSpacing.two,
  },
  detailIcon: {
    alignItems: 'center',
    borderRadius: dailyupRadius.small,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: dailyupSpacing.three,
  },
  detailRows: {
    gap: dailyupSpacing.four,
  },
  fieldLabel: {
    fontFamily: dailyupFonts.bold,
  },
  form: {
    gap: dailyupSpacing.four,
    paddingBottom: dailyupSpacing.six,
    paddingHorizontal: dailyupSpacing.five,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: dailyupRadius.round,
    height: 4,
    marginBottom: dailyupSpacing.three,
    marginTop: dailyupSpacing.two,
    width: 38,
  },
  input: {
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    fontFamily: dailyupFonts.medium,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: dailyupSpacing.three,
    paddingVertical: dailyupSpacing.two,
  },
  inputGroup: {
    gap: dailyupSpacing.one,
    marginTop: dailyupSpacing.two,
  },
  multilineInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  sheet: {
    borderTopLeftRadius: dailyupRadius.sheet,
    borderTopRightRadius: dailyupRadius.sheet,
    borderTopWidth: 1,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: dailyupSpacing.three,
    justifyContent: 'space-between',
    paddingBottom: dailyupSpacing.four,
    paddingHorizontal: dailyupSpacing.five,
  },
  timeField: {
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    gap: dailyupSpacing.three,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: dailyupSpacing.four,
  },
});
