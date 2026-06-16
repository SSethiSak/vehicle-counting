import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CountingScreen from './CountingScreen';
import { Movement, VehicleType } from '../types';

const mockRecord = jest.fn().mockResolvedValue({ id: 1, to_direction: 'S' });
const mockUndo   = jest.fn().mockResolvedValue(true);

jest.mock('../modules/counter/CounterEngine', () => ({
  CounterEngine: jest.fn().mockImplementation(() => ({
    record: mockRecord,
    undo: mockUndo,
  })),
}));
jest.mock('../modules/session/SessionManager', () => ({
  endSession: jest.fn().mockResolvedValue({}),
  getSession: jest.fn().mockResolvedValue({ total_count: 1 }),
}));
jest.mock('../modules/vehicleType/VehicleTypeManager', () => ({
  getVehicleTypes: jest.fn().mockResolvedValue(['Moto', 'Car', 'Rickshaw', 'Other']),
  addVehicleType: jest.fn().mockResolvedValue(undefined),
  deleteVehicleType: jest.fn().mockResolvedValue(undefined),
}));

// Stub IntersectionDragMap so tests can trigger onDrag/onUndo without real gestures
jest.mock('../components/IntersectionDragMap', () => {
  const ReactMock = require('react');
  const { TouchableOpacity: TO, Text: T, View: V } = require('react-native');
  return {
    __esModule: true,
    default: ({
      onDrag,
      onUndo,
    }: {
      onDrag: (from: string, movement: Movement, vehicleType: VehicleType) => void;
      onUndo?: () => void;
    }) =>
      ReactMock.createElement(
        V,
        null,
        ReactMock.createElement(
          TO,
          { testID: 'drag-map', onPress: () => onDrag('N', 'straight', 'moto') },
          ReactMock.createElement(T, null, 'drag'),
        ),
        ReactMock.createElement(
          TO,
          { testID: 'undo-btn', onPress: onUndo },
          ReactMock.createElement(T, null, 'undo'),
        ),
      ),
  };
});

const mockSession = {
  id: 'sess_test', location_name: 'Test', intersection_type: '4way',
  time_period: 'am_peak', lat: null, lng: null, custom_legs: null,
  started_at: new Date().toISOString(), ended_at: null, total_count: 0,
};

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockNavigate }),
  useRoute: () => ({ params: { session: mockSession } }),
}));

beforeEach(() => { jest.clearAllMocks(); });

test('records a count when a drag is completed', async () => {
  const { getByTestId } = render(<CountingScreen />);
  fireEvent.press(getByTestId('drag-map'));
  await waitFor(() => expect(mockRecord).toHaveBeenCalledWith({
    from_direction: 'N',
    movement: 'straight',
    vehicle_type: 'moto',
  }));
});

test('calls undo when undo button pressed', async () => {
  const { getByTestId } = render(<CountingScreen />);
  fireEvent.press(getByTestId('undo-btn'));
  await waitFor(() => expect(mockUndo).toHaveBeenCalledTimes(1));
});

test('shows End Session confirmation and navigates on confirm', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    const destructiveBtn = buttons?.find((b) => b.style === 'destructive');
    destructiveBtn?.onPress?.();
  });
  const { getByTestId } = render(<CountingScreen />);
  fireEvent.press(getByTestId('end-session-btn'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('SessionReview', { sessionId: 'sess_test' }));
});
