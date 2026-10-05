/* Deliberately buggy teaching example. Do not reuse these patterns. */
#include <stdio.h>
#include <stdlib.h>

static volatile int observed;

static void write_past_end(void)
{
    int *numbers = malloc(3 * sizeof(*numbers));
    if (!numbers) exit(1);
    numbers[3] = 42; /* BUG: valid indices are 0, 1, 2. */
    free(numbers);
}

static void read_after_free(void)
{
    int *value = malloc(sizeof(*value));
    if (!value) exit(1);
    *value = 7;
    free(value);
    observed = *value; /* BUG: the allocation's lifetime has ended. */
}

static void lose_allocation(void)
{
    char *message = malloc(64);
    if (!message) exit(1);
    message[0] = 'L';
    observed = message[0];
    /* BUG: return without freeing message or preserving its pointer. */
}

int main(void)
{
    write_past_end();
    read_after_free();
    lose_allocation();
    puts("Demo finished. Inspect the Memcheck log to find the bugs.");
    return 0;
}
