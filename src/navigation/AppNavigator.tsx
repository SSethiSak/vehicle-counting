import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SessionsListScreen from '../screens/SessionsListScreen';
import SessionSetupScreen from '../screens/SessionSetupScreen';
import CountingScreen from '../screens/CountingScreen';
import SessionReviewScreen from '../screens/SessionReviewScreen';
import PedestrianCountingScreen from '../screens/PedestrianCountingScreen';
import { Session } from '../types';
import { useTheme } from '../context/ThemeContext';

export type RootStackParamList = {
  SessionsList: undefined;
  SessionSetup: undefined;
  Counting: { session: Session };
  SessionReview: { sessionId: string };
  PedestrianCounting: { session: Session };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const G = useTheme();
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="SessionsList"
        screenOptions={{
          headerStyle: { backgroundColor: G.bg },
          headerTintColor: G.blue,
          headerTitleStyle: { color: G.text, fontWeight: '700', fontSize: 17 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: G.bg },
        }}
      >
        <Stack.Screen name="SessionsList" component={SessionsListScreen} options={{ title: 'Sessions' }} />
        <Stack.Screen name="SessionSetup" component={SessionSetupScreen} options={{ title: 'New Session' }} />
        <Stack.Screen name="Counting"     component={CountingScreen}     options={{ headerShown: false }} />
        <Stack.Screen name="SessionReview" component={SessionReviewScreen} options={{ title: 'Review' }} />
        <Stack.Screen name="PedestrianCounting" component={PedestrianCountingScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
