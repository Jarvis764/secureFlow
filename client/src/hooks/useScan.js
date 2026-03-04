import { useState } from 'react';

export function useScan() {
  return { scan: null, loading: false, error: null };
}
