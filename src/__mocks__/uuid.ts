let counter = 0;

export const v4 = jest.fn(() => `unique-id-${counter++}`);
export const reset = jest.fn(() => {
  counter = 0;
});
