import React from "react";
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
  CopyButton,
  Alert,
  Group,
  ThemeIcon,
  Progress,
  Tooltip as MantineTooltip,
  ActionIcon,
  Avatar,
} from "@mantine/core";
import { IconCheck, IconChartBar, IconCopy, IconTrophy } from "@tabler/icons-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { usd, parseTransactions, categoryFromType, formatHourAmPm, formatMonthDay, startOfHour } from "./utils";
import { useMantineColorScheme } from "@mantine/core";
import { useMemo, useState, useCallback, useDeferredValue } from "react";
import { useClipboard } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

const EarningsTooltip = React.memo(function EarningsTooltip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null;

  const row = payload[0].payload;
  const d = new Date(label);

  let txCount = row.count;
  if (mode === "tips") txCount = row.tipsCount;
  if (mode === "posts") txCount = row.postsCount;
  if (mode === "subs") txCount = row.subsCount;

  return (
    <Paper p="xs" shadow="md" withBorder>
      <Text size="sm" fw={500}>
        {formatMonthDay(label)} {formatHourAmPm(d.getHours())}
      </Text>
      <Text size="sm">Earnings {usd.format(payload[0].value)}</Text>
      <Text size="sm" c="dimmed">
        Transactions {txCount}
        {mode === "messages" && (
          <>
            <Text component="span" size="sm" c="red" inherit>
              {" "}
              PPV {row.messagesPpvCount}
            </Text>
            <Text component="span" size="sm" c="blue" inherit>
              {" "}
              No PPV {row.messagesNoPpvCount}
            </Text>
          </>
        )}
      </Text>
    </Paper>
  );
});

const TopSpenders = ({ parsed }) => {
  const topSpenders = useMemo(() => {
    if (!parsed?.length) return [];

    const userMap = new Map();

    parsed.forEach((p) => {
      let name = "Unknown";
      if (p.text) {
        const match = p.text.match(/\b(from|by)\s+(.+)/i);
        if (match && match[2]) {
          name = match[2].trim();
        } else {
          name = p.text.replace(/Payment for message|Tip from|Recurring subscription/gi, "").trim();
        }
      }

      const amountGross = p.gross || 0;
      const amountNet = p.net || 0;

      if (userMap.has(name)) {
        const current = userMap.get(name);
        userMap.set(name, {
          gross: current.gross + amountGross,
          net: current.net + amountNet,
        });
      } else {
        userMap.set(name, { gross: amountGross, net: amountNet });
      }
    });

    return Array.from(userMap.entries())
      .map(([name, amounts]) => ({ name, ...amounts }))
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 3);
  }, [parsed]);

  if (topSpenders.length === 0) return null;

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="xs">
        <Text size="sm" fw={500}>Top 3 Spenders</Text>
        <ThemeIcon color="yellow" variant="light" size={20}>
          <IconTrophy size={14} />
        </ThemeIcon>
      </Group>
      <Stack gap="xs">
        {topSpenders.map((spender, index) => (
          <Group key={index} justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Avatar src={null} alt={spender.name} radius="xl" size="sm" color={index === 0 ? "yellow" : "gray"}>
                {spender.name.charAt(0).toUpperCase()}
              </Avatar>
              <Text size="sm" lineClamp={1} fw={index === 0 ? 700 : 400}>
                {spender.name}
              </Text>
            </Group>
            <Stack gap={0} align="flex-end">
              <Text size="xs" c="dimmed">Gross: {usd.format(spender.gross)}</Text>
              <Text size="sm" fw={500} c="green">Net: {usd.format(spender.net)}</Text>
            </Stack>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
};

const StatsCards = ({ totals, parsed, onCopy }) => {
  const clipboard = useClipboard({ timeout: 800 });

  const handleCopy = useCallback(() => {
    if (!totals) return;
    const textToCopy = `Total PPV\t${usd.format(totals.ppv + totals.noPpv)}\nTotal NOPPV\t${usd.format(totals.noPpv)}`;
    clipboard.copy(textToCopy);
    if (onCopy) onCopy();
  }, [totals, clipboard, onCopy]);

  const breakdown = useMemo(() => {
    if (!parsed?.length) {
      return [
        { label: "Tips", value: 0, count: 0, color: "yellow", percent: 0 },
        { label: "Messages", value: 0, count: 0, color: "blue", percent: 0 },
        { label: "Subs", value: 0, count: 0, color: "cyan", percent: 0 },
        { label: "Posts", value: 0, count: 0, color: "grape", percent: 0 },
      ];
    }

    let tips = 0, posts = 0, subs = 0, messages = 0;
    
    parsed.forEach((p) => {
      const cat = categoryFromType(p.type);
      if (!cat) return;
      if (cat === "tips") tips += p.net;
      if (cat === "posts") posts += p.net;
      if (cat === "subs") subs += p.net;
      if (cat === "messages") messages += p.net;
    });

    const totalNet = tips + posts + subs + messages;

    return [
      { label: "Tips", value: tips, count: 0, color: "yellow", percent: 0 }, // Count removed to clean up unused calc
      { label: "Messages", value: messages, count: 0, color: "blue", percent: 0 },
      { label: "Subs", value: subs, count: 0, color: "cyan", percent: 0 },
      { label: "Posts", value: posts, count: 0, color: "grape", percent: 0 },
    ]
      .map((item) => ({
        ...item,
        percent: totalNet ? (item.value / totalNet) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [parsed]);

  const velocity = useMemo(() => {
    if (!parsed?.length) return { avgTxSize: 0 };

    let totalGross = 0;
    parsed.forEach((p) => totalGross += p.gross);

    return {
      avgTxSize: parsed.length ? totalGross / parsed.length : 0,
    };
  }, [parsed]);

  const safeTotals = {
    ppv: totals?.ppv || 0,
    noPpv: totals?.noPpv || 0,
  };

  return (
    <SimpleGrid cols={2} spacing="md" w="100%">
      <Paper withBorder p="md">
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={500}>Performance Analytics</Text>
          <CopyButton value="" timeout={2000}>
            {({ copied, copy }) => (
              <MantineTooltip label={copied ? "Earnings copied" : "Copy earnings"} withArrow position="right">
                <ThemeIcon color="gray" variant="light" size={20}>
                  <ActionIcon
                    color={copied ? "teal" : "gray"}
                    variant="subtle"
                    onClick={() => {
                      copy();
                      handleCopy();
                    }}
                  >
                    {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  </ActionIcon>
                </ThemeIcon>
              </MantineTooltip>
            )}
          </CopyButton>
        </Group>

        <SimpleGrid cols={2} spacing="sm">
          <Box>
            <Text size="xs" c="dimmed">Total PPV</Text>
            <Text size="lg" fw={700}>{usd.format(safeTotals.noPpv + safeTotals.ppv)}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">Total NoPPV</Text>
            <Text size="lg" fw={700}>{usd.format(safeTotals.noPpv)}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">Avg Transaction</Text>
            <Text size="lg" fw={700} c="blue">{usd.format(velocity.avgTxSize)}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">Average $ per transaction</Text>
            <Text size="lg" fw={700} c="orange">{ usd.format((safeTotals.noPpv + safeTotals.ppv)/parsed?.length || 0)}</Text>
          </Box>

                    <Box>
            <Text size="xs" c="dimmed">Total transactions</Text>
            <Text size="lg" fw={700} c="orange">{parsed?.length || 0} txs</Text>
          </Box>
        </SimpleGrid>
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={500}>Revenue Sources</Text>
          <ThemeIcon color="gray" variant="light" size={20}>
            <IconChartBar size={14} />
          </ThemeIcon>
        </Group>

        <Stack gap="sm">
          {breakdown.map((item) => (
            <div key={item.label}>
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">{item.label}</Text>
                <Text size="xs" fw={500}>
                  {usd.format(item.value)} <span style={{ opacity: 0.6 }}>({Math.round(item.percent)}%)</span>
                </Text>
              </Group>
              <Progress value={item.percent} color={item.color} size={4} />
            </div>
          ))}
        </Stack>
      </Paper>
    </SimpleGrid>
  );
};

export default function App() {
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState("all");
  // valueMode removed as requested

  const deferredRaw = useDeferredValue(raw);

  const { parsed, hasError } = useMemo(() => parseTransactions(deferredRaw), [deferredRaw]);

  const { totals, data } = useMemo(() => {
    if (hasError || !parsed.length) {
      return { totals: null, data: [] };
    }

    let ppvNet = 0;
    let noPpvNet = 0;
    const rowsMap = new Map();

    parsed.forEach((p) => {
      if (p.isPpv) {
        ppvNet += p.net;
      } else {
        noPpvNet += p.net;
      }

      const hourTs = startOfHour(p.timestamp);
      const category = categoryFromType(p.type);

      if (!category) return;

      if (!rowsMap.has(hourTs)) {
        rowsMap.set(hourTs, {
          timestamp: hourTs,
          tips: 0,
          posts: 0,
          subs: 0,
          messages: 0,
          all: 0,
          messagesPpv: 0,
          messagesNoPpv: 0,
          count: 0,
          tipsCount: 0,
          postsCount: 0,
          subsCount: 0,
          messagesCount: 0,
          messagesPpvCount: 0,
          messagesNoPpvCount: 0,
        });
      }

      const row = rowsMap.get(hourTs);
      const amount = p.net; // Hardcoded to Net since valueMode is removed

      if (category === "messages") {
        if (p.isPpv) {
          row.messagesPpv += amount;
          row.messagesPpvCount += 1;
        } else {
          row.messagesNoPpv += amount;
          row.messagesNoPpvCount += 1;
        }
      }

      row[category] += amount;
      row.all += amount;
      row.count += 1;
      row[`${category}Count`] += 1;
    });

    const data = Array.from(rowsMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    return {
      totals: {
        ppv: ppvNet,
        noPpv: noPpvNet,
        total: ppvNet + noPpvNet,
      },
      data,
    };
  }, [parsed, hasError]);

  const tickFormatter = useCallback((v) => {
    const d = new Date(v);
    if (d.getHours() === 0) {
      return `${formatMonthDay(v)} ${formatHourAmPm(0)}`;
    }
    return formatHourAmPm(d.getHours());
  }, []);

  const tooltipContent = useMemo(() => <EarningsTooltip mode={mode} />, [mode]);

  const { toggleColorScheme } = useMantineColorScheme({ keepTransitions: true });

  const copyTotals = useCallback(() => {
    notifications.show({
      title: "Totals copied to clipboard",
      message: "PPV and NOPPV earnings copied.",
      color: "green",
      position: "top-right",
    });
  }, []);

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
            {/* LEFT COLUMN */}
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

            {/* RIGHT COLUMN */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                minHeight: 0,
              }}
            >
              {/* UPPER SECTION */}
              <div style={{ flex: "0 0 auto" }}>
                <StatsCards totals={totals} parsed={parsed} onCopy={copyTotals} />
                <Box mt="md">
                  <TopSpenders parsed={parsed} />
                </Box>
              </div>

              {/* LOWER SECTION: Chart */}
              <Paper
                mt="md"
                p="xs"
                withBorder
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minHeight: 0,
                  maxHeight: "40%",
                  height: "40%",
                }}
              >
                <Text fw={500} mb="xs" size="sm" ta="center">
                  Hourly earnings breakdown
                </Text>

                <SegmentedControl
                  fullWidth
                  size="xs"
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

                <Box style={{ flex: 1, minHeight: 0, position: "relative", paddingTop: "24px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                      <CartesianGrid strokeOpacity={0.05} />
                      <XAxis
                        dataKey="timestamp"
                        interval={0}
                        allowDuplicatedCategory={false}
                        tickFormatter={tickFormatter}
                        angle={-35}
                        textAnchor="end"
                        height={50}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis tickFormatter={usd.format} width={40} tick={{ fontSize: 10 }} />
                      <Tooltip content={tooltipContent} />
                      {mode === "messages" ? (
                        <>
                          <Area type="linear" dataKey="messagesNoPpv" stroke="#007aff" strokeWidth={2} fill="rgba(0,122,255,0.15)" />
                          <Area type="linear" dataKey="messagesPpv" stroke="#ff3b30" strokeWidth={2} fill="rgba(255,59,48,0.15)" />
                        </>
                      ) : (
                        <Area
                          type="linear"
                          dataKey={mode === "all" ? "all" : mode}
                          stroke="#007aff"
                          strokeWidth={2}
                          fill="rgba(0,122,255,0.15)"
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </div>
          </SimpleGrid>
        </Box>
      </Box>

      <Affix position={{ bottom: 20, right: 20 }}>
        <Button onClick={toggleColorScheme} variant="light">
          Toggle theme
        </Button>
      </Affix>
    </>
  );
}