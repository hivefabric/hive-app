import 'package:flutter/material.dart';

import 'owner_policy.dart';

/// Single-screen ListView of OwnerPolicy controls. Functional, not pretty —
/// the intent is to expose every H-10 field a contributor cares about today.
class OwnerPolicyScreen extends StatefulWidget {
  const OwnerPolicyScreen({super.key, required this.store});

  final WaxLocalStore store;

  @override
  State<OwnerPolicyScreen> createState() => _OwnerPolicyScreenState();
}

class _OwnerPolicyScreenState extends State<OwnerPolicyScreen> {
  OwnerPolicy? _policy;
  bool _loading = true;
  bool _saving = false;
  final TextEditingController _blockedCapsCtl = TextEditingController();
  final TextEditingController _geoTagsCtl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await widget.store.loadPolicy();
    if (!mounted) return;
    setState(() {
      _policy = p;
      _blockedCapsCtl.text = p.blockedCapabilityUrns.join(', ');
      _geoTagsCtl.text = p.geoTags.join(', ');
      _loading = false;
    });
  }

  Future<void> _save() async {
    final p = _policy;
    if (p == null) return;
    setState(() => _saving = true);
    final next = p.copyWith(
      blockedCapabilityUrns: _splitCsv(_blockedCapsCtl.text),
      geoTags: _splitCsv(_geoTagsCtl.text),
    );
    await widget.store.savePolicy(next);
    if (!mounted) return;
    setState(() {
      _policy = next;
      _saving = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
            'Policy saved. New values are sent on the next register/heartbeat.'),
      ),
    );
  }

  List<String> _splitCsv(String raw) => raw
      .split(',')
      .map((e) => e.trim())
      .where((e) => e.isNotEmpty)
      .toList(growable: false);

  @override
  void dispose() {
    _blockedCapsCtl.dispose();
    _geoTagsCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _policy == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Owner Policy')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    final p = _policy!;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Owner Policy'),
        actions: [
          IconButton(
            tooltip: 'Save',
            onPressed: _saving ? null : _save,
            icon: const Icon(Icons.save_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const _SectionHeader('When this device may run tasks'),
          SwitchListTile(
            title: const Text('Only when charging'),
            subtitle: const Text(
                'Refuse all foreign tasks while running on battery.'),
            value: p.onlyWhenCharging,
            onChanged: (v) =>
                setState(() => _policy = p.copyWith(onlyWhenCharging: v)),
          ),
          SwitchListTile(
            title: const Text('Only on Wi-Fi'),
            subtitle: const Text(
                'No tasks while on cellular / metered network. Heartbeats still flow.'),
            value: p.onlyOnWifi,
            onChanged: (v) =>
                setState(() => _policy = p.copyWith(onlyOnWifi: v)),
          ),
          ListTile(
            title: const Text('Minimum battery'),
            subtitle: Text('${p.batteryMinPercent}%'),
          ),
          Slider(
            min: 0,
            max: 100,
            divisions: 20,
            value: p.batteryMinPercent.toDouble(),
            label: '${p.batteryMinPercent}%',
            onChanged: (v) => setState(
                () => _policy = p.copyWith(batteryMinPercent: v.round())),
          ),
          ListTile(
            title: const Text('Max CPU usage'),
            subtitle: Text('${p.cpuMaxPercent}%'),
          ),
          Slider(
            min: 10,
            max: 100,
            divisions: 18,
            value: p.cpuMaxPercent.toDouble(),
            label: '${p.cpuMaxPercent}%',
            onChanged: (v) =>
                setState(() => _policy = p.copyWith(cpuMaxPercent: v.round())),
          ),
          ListTile(
            title: const Text('Thermal ceiling'),
            subtitle: Text('Stop accepting tasks above: ${p.thermalMax}'),
          ),
          DropdownButton<String>(
            value: p.thermalMax,
            items: const [
              DropdownMenuItem(value: 'cool', child: Text('cool (strict)')),
              DropdownMenuItem(value: 'warm', child: Text('warm (default)')),
              DropdownMenuItem(value: 'hot', child: Text('hot (permissive)')),
            ],
            onChanged: (v) {
              if (v == null) return;
              setState(() => _policy = p.copyWith(thermalMax: v));
            },
          ),
          const Divider(),
          const _SectionHeader('Quiet hours (local time)'),
          ListTile(
            title: const Text('Start hour'),
            subtitle: Text('${_fmtHour(p.quietHoursStart)} (24h)'),
          ),
          Slider(
            min: 0,
            max: 23,
            divisions: 23,
            value: p.quietHoursStart.toDouble(),
            label: _fmtHour(p.quietHoursStart),
            onChanged: (v) => setState(
                () => _policy = p.copyWith(quietHoursStart: v.round())),
          ),
          ListTile(
            title: const Text('End hour'),
            subtitle: Text('${_fmtHour(p.quietHoursEnd)} (24h)'),
          ),
          Slider(
            min: 0,
            max: 23,
            divisions: 23,
            value: p.quietHoursEnd.toDouble(),
            label: _fmtHour(p.quietHoursEnd),
            onChanged: (v) =>
                setState(() => _policy = p.copyWith(quietHoursEnd: v.round())),
          ),
          const Divider(),
          const _SectionHeader('Sensitivity & capabilities'),
          ListTile(
            title: const Text('Allowed sensitivity tiers'),
            subtitle: Text(p.allowedSensitivity.join(', ')),
          ),
          Wrap(
            spacing: 8,
            children: [
              for (final t in const ['public', 'internal', 'confidential'])
                FilterChip(
                  label: Text(t),
                  selected: p.allowedSensitivity.contains(t),
                  onSelected: (sel) {
                    final set = p.allowedSensitivity.toSet();
                    if (sel) {
                      set.add(t);
                    } else {
                      set.remove(t);
                    }
                    setState(() => _policy =
                        p.copyWith(allowedSensitivity: set.toList()));
                  },
                ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _blockedCapsCtl,
            decoration: const InputDecoration(
              labelText: 'Blocked capability URNs (comma-separated)',
              hintText: 'urn:hive:capability:network.scan, urn:hive:capability:llm.large',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _geoTagsCtl,
            decoration: const InputDecoration(
              labelText: 'Geo tags (comma-separated)',
              hintText: 'eu-west, residential',
              border: OutlineInputBorder(),
            ),
          ),
          const Divider(),
          const _SectionHeader('Daily quotas (0 = unlimited)'),
          ListTile(
            title: const Text('Max tasks per day'),
            subtitle: Text(p.maxTasksPerDay == 0
                ? 'unlimited'
                : '${p.maxTasksPerDay}'),
          ),
          Slider(
            min: 0,
            max: 1000,
            divisions: 100,
            value: p.maxTasksPerDay.toDouble().clamp(0, 1000),
            label: p.maxTasksPerDay == 0 ? 'off' : '${p.maxTasksPerDay}',
            onChanged: (v) => setState(
                () => _policy = p.copyWith(maxTasksPerDay: v.round())),
          ),
          ListTile(
            title: const Text('Max foreign-task minutes per day'),
            subtitle: Text(p.maxForeignMinutesPerDay == 0
                ? 'unlimited'
                : '${p.maxForeignMinutesPerDay} min'),
          ),
          Slider(
            min: 0,
            max: 480,
            divisions: 48,
            value: p.maxForeignMinutesPerDay.toDouble().clamp(0, 480),
            label: p.maxForeignMinutesPerDay == 0
                ? 'off'
                : '${p.maxForeignMinutesPerDay}m',
            onChanged: (v) => setState(() =>
                _policy = p.copyWith(maxForeignMinutesPerDay: v.round())),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            icon: const Icon(Icons.save),
            onPressed: _saving ? null : _save,
            label: Text(_saving ? 'Saving...' : 'Save policy'),
          ),
        ],
      ),
    );
  }

  String _fmtHour(int h) =>
      '${h.toString().padLeft(2, '0')}:00';
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    );
  }
}
