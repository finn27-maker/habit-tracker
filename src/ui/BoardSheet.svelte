<script lang="ts">
  import { editValues, type Board } from './board.svelte';
  import HabitForm from './HabitForm.svelte';

  let { board }: { board: Board } = $props();
</script>

{#if board.form}
  {@const current = board.form}
  <HabitForm
    lists={board.lists}
    today={board.today}
    error={board.formError}
    initial={current.kind === 'edit' ? editValues(current.row) : undefined}
    listId={current.kind === 'new' ? current.listId : undefined}
    onSubmit={(values) => board.save(current, values)}
    onCancel={() => board.closeForm()}
    onDelete={current.kind === 'edit' ? () => board.remove(current.row.item.id) : undefined}
  />
{/if}
