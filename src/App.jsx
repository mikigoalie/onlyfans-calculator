import {
  Box,
  Textarea,
  SimpleGrid,
  Stack,
  Paper,
  Text,
  SegmentedControl,
  Affix,
  Button,
  Grid,
  Tooltip as MantineTooltip,
} from "@mantine/core";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  usd,
  parseTransactions,
  categoryFromType,
  formatHourAmPm,
  formatMonthDay,
} from "./utils";


import { useMantineColorScheme } from "@mantine/core";
import { useMemo, useState } from "react";
import { useClipboard } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";


function EarningsTooltip({ active, payload, label, mode }) {
  if (!active || !payload || !payload.length) return null;

  const row = payload[0].payload;
  const d = new Date(label);

  let txCount = row.count;
  if (mode === "tips") txCount = row.tipsCount;
  if (mode === "posts") txCount = row.postsCount;
  if (mode === "messages") txCount = row.messagesCount;
  if (mode === "subs") txCount = row.subsCount;

  return (
    <Paper p="xs" shadow="md" withBorder>
      <Text size="sm" fw={500}>
        {`${formatMonthDay(label)} ${formatHourAmPm(d.getHours())}`}
      </Text>
      <Text size="sm">Earnings {usd.format(payload[0].value)}</Text>
      <Text size="sm" c="dimmed">
        Transactions {txCount}
      </Text>
    </Paper>
  );
}


const App = () => {
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState("all");
  const [valueMode, setValueMode] = useState("net");

const { parsed, hasError } = useMemo(() => parseTransactions(raw), [raw]);

  const totals = useMemo(() => {
    if (hasError) return null;

    let ppvNet = 0;
    let noPpvNet = 0;

    parsed.forEach((p) => {
      p.isPpv ? (ppvNet += p.net) : (noPpvNet += p.net);
    });

    return {
      ppv: ppvNet + noPpvNet,
      noPpv: noPpvNet,
    };
  }, [parsed, hasError]);

  const data = useMemo(() => {
    if (hasError || !parsed.length) return [];

    const min = Math.min(...parsed.map((p) => p.timestamp));
    const max = Math.max(...parsed.map((p) => p.timestamp));

    const rows = [];
    for (let t = min; t <= max; t += 3600000) {
      rows.push({
        timestamp: t,
        tips: 0,
        posts: 0,
        subs: 0,
        messages: 0,
        all: 0,
        count: 0,
        tipsCount: 0,
        postsCount: 0,
        subsCount: 0,
        messagesCount: 0,
      });
    }

    parsed.forEach((p) => {
      const i = Math.floor((p.timestamp - min) / 3600000);
      const category = categoryFromType(p.type);
      if (!category) return;

      const amount = valueMode === "net" ? p.net : p.gross;

      rows[i][category] += amount;
      rows[i].all += amount;
      rows[i].count += 1;
      rows[i][`${category}Count`] += 1;
    });

    return rows;
  }, [parsed, hasError, valueMode]);

  const areaKey = mode === "all" ? "all" : mode;
  const { toggleColorScheme } = useMantineColorScheme({
    keepTransitions: true,
  });
  const clipboard = useClipboard({ timeout: 800 });

  const copyTotals = () => {
    if (!totals) return;

    clipboard.copy(
      `Total PPV\t${usd.format(totals.ppv)}\nTotal NOPPV\t${usd.format(
        totals.noPpv
      )}`
    );

    notifications.show({
      title: "Copied to clipboard",
      color: "green",
      position: "top-right",
    });
  };

  return (
    <>
      <Box
        h="100vh"
        w="100vw"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Box w="90%" maw={1500} h="80%">
          <SimpleGrid cols={2} spacing="xl" style={{ height: "100%" }}>
            <Box style={{ display: "flex", height: "100%" }}>
              <Textarea
                placeholder="Paste copied earnings here"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                styles={{
                  root: { flex: 1 },
                  input: { height: "100%" },
                  wrapper: { height: "100%" },
                }}
              />
            </Box>

            <Stack spacing="md">
              {hasError ? (
                <Paper withBorder p="md">
                  <Text fw={600} c="red">
                    Error detected in pasted data
                  </Text>
                  <Text size="sm" c="dimmed">
                    Paste raw unedited exports only. No statistics were calculated.
                  </Text>
                </Paper>
              ) : (
                <>
                  <MantineTooltip.Group openDelay={1000} closeDelay={100}>
                    <Grid onClick={copyTotals} style={{ cursor: "pointer" }}>
                      <Grid.Col span={4}>
                        <MantineTooltip label="Click to copy earnings" withArrow>
                          <Paper withBorder p="md">
                            <Text size="sm" c="dimmed">
                              PPV NET
                            </Text>
                            <Text fw={700} size="xl">
                              {usd.format(totals.ppv)}
                            </Text>
                          </Paper>
                        </MantineTooltip>
                      </Grid.Col>
                      <Grid.Col span={4}>
                        <MantineTooltip label="Click to copy earnings" withArrow>
                          <Paper withBorder p="md">
                            <Text size="sm" c="dimmed">
                              NO PPV NET
                            </Text>
                            <Text fw={700} size="xl">
                              {usd.format(totals.noPpv)}
                            </Text>
                          </Paper>
                        </MantineTooltip>
                      </Grid.Col>
                      <Grid.Col span={4}>
                        <MantineTooltip label="Click to copy earnings" withArrow>
                          <Paper withBorder p="md">
                            <Text size="sm" c="dimmed">
                              NO PPV NET
                            </Text>
                            <Text fw={700} size="xl">
                              {usd.format(totals.noPpv)}
                            </Text>
                          </Paper>
                        </MantineTooltip>
                      </Grid.Col>
                    </Grid>
                  </MantineTooltip.Group>

                  <Paper p="md" withBorder>
                    <Text fw={500} mb="sm" ta="center">
                      Hourly earnings breakdown by category
                    </Text>

                    <SegmentedControl
                      mb="sm"
                      fullWidth
                      value={valueMode}
                      onChange={setValueMode}
                      data={[
                        { label: "NET", value: "net" },
                        { label: "GROSS", value: "gross" },
                      ]}
                    />

                    <SegmentedControl
                      fullWidth
                      value={mode}
                      onChange={setMode}
                      data={[
                        { label: "All", value: "all" },
                        { label: "Tips", value: "tips" },
                        { label: "Posts", value: "posts" },
                        { label: "Messages", value: "messages" },
                        { label: "Subs", value: "subs" },
                      ]}
                    />

                    <Box h={260} mt="md">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                          <CartesianGrid strokeOpacity={0.05} />
                          <XAxis
                            dataKey="timestamp"
                            interval={
                              data.length <= 24
                                ? 0
                                : data.length <= 72
                                ? 1
                                : 3
                            }
                            tickFormatter={(v) => {
                              const d = new Date(v);
                              const hour = formatHourAmPm(d.getHours());
                              const prev = new Date(v - 3600000);
                              return prev.toDateString() !== d.toDateString()
                                ? `${formatMonthDay(v)} ${hour}`
                                : hour;
                            }}
                            angle={-35}
                            textAnchor="end"
                            height={70}
                          />
                          <YAxis tickFormatter={usd.format} />
                          <Tooltip
                            content={<EarningsTooltip mode={mode} />}
                          />
                          <Area
                            type="linear"
                            dataKey={areaKey}
                            stroke="#007aff"
                            strokeWidth={2}
                            fill="rgba(0,122,255,0.15)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Box>
                  </Paper>
                </>
              )}
            </Stack>
          </SimpleGrid>
        </Box>
      </Box>

      <Affix position={{ bottom: 20, right: 20 }}>
        <Button onClick={toggleColorScheme} variant="light">Toggle theme</Button>
      </Affix>
    </>
  );
};

export default App;
