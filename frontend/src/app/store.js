import { configureStore } from '@reduxjs/toolkit';
import { api } from '../services/api';
import requestsReducer from '../features/requests/requestsSlice';
export const createStore = () =>
  configureStore({
    reducer: { [api.reducerPath]: api.reducer, requests: requestsReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
  });
export const store = createStore();
