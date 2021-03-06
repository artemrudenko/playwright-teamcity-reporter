const replacer = () => {
  const seen = new WeakSet();
  return (key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

export const stringify = (data: any, space?: number) => {
  return JSON.stringify(data, replacer(), space).replace(/"/g,"'");
};
