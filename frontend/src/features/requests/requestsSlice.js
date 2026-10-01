import { createSlice } from '@reduxjs/toolkit';
import { api, describeError } from '../../services/api';

// Request history owns submitted inputs and terminal outcomes. Paginated server
// data belongs to RTK Query. Drafts/search/sort stay local to their UI owners.
const requestsSlice = createSlice({
  name: 'requests',
  initialState: { entries: [], activeId: null },
  reducers: {
    selectRequest(state, action) {
      state.activeId = action.payload;
    },
    newRequest(state) {
      state.activeId = null;
    },
  },
  extraReducers: (builder) =>
    builder
      .addMatcher(api.endpoints.submitPrompt.matchPending, (state, action) => {
        const id = action.meta.requestId;
        state.entries.unshift({
          id,
          input: action.meta.arg.originalArgs,
          status: 'PENDING',
          response: null,
          error: null,
        });
        state.entries = state.entries.slice(0, 30);
        state.activeId = id;
      })
      .addMatcher(api.endpoints.submitPrompt.matchFulfilled, (state, action) => {
        const entry = state.entries.find((item) => item.id === action.meta.requestId);
        if (entry) {
          entry.response = action.payload;
          entry.status = action.payload.status;
        }
      })
      .addMatcher(api.endpoints.submitPrompt.matchRejected, (state, action) => {
        const entry = state.entries.find((item) => item.id === action.meta.requestId);
        if (entry) {
          entry.status = 'ERROR';
          entry.error = describeError(action.payload);
        }
      }),
});
export const { selectRequest, newRequest } = requestsSlice.actions;
export const selectActiveRequest = (state) =>
  state.requests.entries.find((entry) => entry.id === state.requests.activeId);
export default requestsSlice.reducer;
