import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cardsApi } from '../api/cards';

export function useCards() {
  return useQuery({ queryKey: ['cards'], queryFn: cardsApi.list });
}

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: cardsApi.create, onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }) });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => cardsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: cardsApi.remove, onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }) });
}
