import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions';

function invalidateDashboard(qc) {
  ['summary', 'trend', 'byCategory', 'monthly', 'transactions-recent'].forEach(k =>
    qc.invalidateQueries({ queryKey: [k] })
  );
}

export function useTransactions(params) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => transactionsApi.list(params),
  });
}

export function useTransactionSummary(params) {
  return useQuery({
    queryKey: ['transactions', 'summary', params],
    queryFn: () => transactionsApi.summary(params),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      invalidateDashboard(qc);
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: transactionsApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      invalidateDashboard(qc);
    },
  });
}
